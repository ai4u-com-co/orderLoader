/**
 * Step 1: PDF → DB (estado PARSED).
 *
 * Comodin + Exito: Claude AI extrae directamente el JSON SAP B1.
 * Es idempotente: carpetas con data_extraida.json se saltan.
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "../config";
import { getDb, logPipeline, errToMsg } from "../db";
import { OrderStatus } from "../constants";
import { SapB1OrderSchema, type SapB1Order } from "../schemas";
export type { SapB1Order };
import { detectClientFromPdf, esDirigidoAEmpresa, loadClientListsFromDb } from "../pdf-classify";
import type { TriageResult } from "../ai-triage";
import { getClientes } from "../db";
import { pdfToImages, buildVisionContent } from "../pdf-vision";
import { withAnthropicRetry } from "../anthropic-retry";
import { extractResponseText } from "../anthropic-content";
import { estimateCostUsd } from "../pricing";

const PARSE_MODEL = "claude-sonnet-5";

// Reintentos INMEDIATOS (misma invocación de parseWithAI) exclusivos para el caso donde
// el ÚNICO campo que falla la validación Zod es DocType — un valor fijo que el prompt le
// pide al modelo devolver siempre igual ("dDocument_Items"), sin relación con el contenido
// del PDF (ver lib/prompt-generation.ts). No es un campo que dependa de lo que el modelo lea:
// es una alucinación puntual del modelo de visión, confirmada contra pipeline_log real de
// producción (VM Tamaprint, ago-sep 2026): en 3 de 4 casos reales, el mismo PDF con el mismo
// prompt devolvió el valor correcto en el reintento siguiente del pipeline (hasta 1h después,
// vía el mecanismo de reintentos entre corridas de step1). El 4/4 caso restante (OC 15192,
// 2026-09-07) agotó los 3 reintentos ENTRE corridas — separados por hasta 1h cada uno — y
// quedó en ERROR_PARSE pese a que el pedido era 100% válido en todos los demás campos.
// Este retry interno no afloja la validación (DocType sigue exigiendo el literal exacto):
// solo le da al modelo 2 oportunidades adicionales, en la misma corrida, antes de gastar
// un ciclo completo de reintento entre corridas (que puede tardar hasta 1h en producción).
const MAX_DOCTYPE_RETRIES = 2;

export interface StepResult {
  procesados: number;
  errores: number;
  saltados: number;
  detalles: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function yyyymmddToIso(d: string): string {
  if (/^\d{8}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  return d;
}

function todayYYYYMMDD(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * El triage IA (step0) ya clasifica cada adjunto por tipo, con razón, antes de
 * copiarlo a la carpeta del cliente — 'documento_relevante' es la clasificación
 * donde el triage está seguro de que NO es una orden de compra (ej. comprobante
 * de pago). Reusar ese veredicto evita gastar una llamada al modelo que sabemos
 * de antemano que va a fallar: el prompt de extracción de OC no contempla ese
 * caso y suele forzar un JSON con campos vacíos en vez de negarse con texto
 * (ver bug real NewStetic 2026-07-27 — el modelo devolvió NumAtCard:"" y
 * DocumentLines:[] porque su prompt le prohíbe escribir cualquier explicación).
 */
export function getTriageTipo(carpetaPath: string, pdfFile: string): TriageResult | null {
  const metaPath = path.join(carpetaPath, "correo_metadata.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { triage_ia?: TriageResult[] };
    return meta.triage_ia?.find(t => t.filename === pdfFile) ?? null;
  } catch {
    return null;
  }
}

// ── AI Parser ─────────────────────────────────────────────────────────────────

export async function parseWithAI(pdfBuffer: Buffer, prompt: string): Promise<[SapB1Order | null, string, { input?: number, output?: number }]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [null, "ANTHROPIC_API_KEY no configurado en .env", {}];

  const client = new Anthropic({ apiKey });

  // Convertir PDF a imágenes para que Claude vea la tabla visualmente,
  // evitando que pdf-parse fusione columnas adyacentes (ej. ítem + código).
  const { pages } = await pdfToImages(pdfBuffer);
  const visionContent = buildVisionContent(pages);

  let lastUsage: { input?: number, output?: number } = {};

  for (let attempt = 0; attempt <= MAX_DOCTYPE_RETRIES; attempt++) {
    // Sonnet 5 rechaza temperature no-default con 400 (a diferencia de 4.6, que sí la
    // aceptaba) — se omite. output_config.effort:"high" es el default del modelo, se deja
    // explícito porque esta extracción alimenta un upload automático a SAP en producción.
    //
    // .stream().finalMessage() en vez de .create(): con max_tokens:65536 el SDK estima
    // (calculateNonstreamingTime) que una respuesta no-streaming podría tardar más de 10
    // minutos y RECHAZA la llamada de entrada con "Streaming is required..." — ocurre para
    // cualquier PDF, sin tocar la red (ver ERROR_PARSE en prod, OC 460164890027081, 28-ago).
    // finalMessage() devuelve el mismo shape de Message que .create(), sin cambios aguas abajo.
    const msg = await withAnthropicRetry(() => client.messages.stream({
      model: PARSE_MODEL,
      // Pedidos multi-tienda (ej. Hermeco/OFFCORSS: 1 línea por tienda, mismo artículo,
      // FreeText con el identificador de tienda por línea — ver OC 4500416657) pueden
      // superar 60+ líneas; con FreeText el JSON de salida creció y 8192 truncaba la
      // respuesta a mitad de un valor ("Unterminated string in JSON").
      //
      // 16384 tampoco alcanza para pedidos grandes: verificado en vivo (VM producción,
      // pipeline_log, 2026-08-25) que un pedido Éxito de 51 páginas / ~400 líneas
      // (1 línea por "Dependencia de Entrega"/tienda, mismo artículo repetido) truncó
      // el JSON en 3 intentos distintos con errores "Unterminated string in JSON",
      // "Expected double-quoted property name in JSON" y "Unexpected end of JSON input"
      // — los tres síntomas clásicos de una respuesta cortada por max_tokens, no de
      // caracteres sin escapar. Claude Sonnet 5 soporta hasta 128K tokens de salida en
      // la API síncrona (docs.claude.com, ago-2026); 65536 deja margen amplio (~10x el
      // caso más grande observado) sin acercarse al techo real del modelo.
      max_tokens: 65536,
      output_config: { effort: "high" },
      system: prompt,
      messages: [{ role: "user", content: visionContent }],
    }).finalMessage());

    const text = extractResponseText(msg.content);
    const usage = { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens };
    lastUsage = usage;
    if (!text) return [null, "Respuesta vacía del modelo", usage];

    // Detectar cuando Claude indica que el adjunto no es una OC
    const NOT_PO_PHRASES = [
      "not a purchase order", "is not a purchase order", "not an order",
      "no es una orden", "no es una OC", "cannot generate the requested json",
      "is not valid", "not a valid", "this is a", "this image shows",
    ];
    if (NOT_PO_PHRASES.some(p => text.toLowerCase().includes(p.toLowerCase()))) {
      return [null, `Adjunto no es una OC — requiere revisión manual: ${text.slice(0, 200)}`, usage];
    }

    // Limpiar fences de markdown y extraer bloque JSON aunque Claude haya añadido texto antes
    const stripped = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
    const clean = stripped.startsWith("{") ? stripped : (stripped.match(/\{[\s\S]*\}/)?.[0] ?? stripped);

    try {
      const rawOrder = JSON.parse(clean);

      // Fechas por defecto si el AI no pudo leerlas del PDF
      const isValidYYYYMMDD = (v: unknown) => typeof v === "string" && /^\d{8}$/.test(v);
      const thisYear = new Date().getFullYear();
      // TaxDate debe ser del año actual (período abierto en SAP); si el AI leyó una fecha antigua, usar hoy
      const isRecentYear = (v: unknown) => isValidYYYYMMDD(v) && parseInt(String(v).slice(0, 4)) >= thisYear;
      if (!isRecentYear(rawOrder.TaxDate))    rawOrder.TaxDate    = todayYYYYMMDD();
      if (!isValidYYYYMMDD(rawOrder.DocDueDate)) rawOrder.DocDueDate = todayYYYYMMDD(15);

      // Normalizar DeliveryDate en líneas: el AI a veces devuelve YYYY-MM-DD u otros formatos
      if (Array.isArray(rawOrder.DocumentLines)) {
        for (const line of rawOrder.DocumentLines) {
          if (!isValidYYYYMMDD(line.DeliveryDate)) {
            // Intentar convertir YYYY-MM-DD → YYYYMMDD
            if (typeof line.DeliveryDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(line.DeliveryDate)) {
              line.DeliveryDate = line.DeliveryDate.replace(/-/g, "");
            } else {
              line.DeliveryDate = rawOrder.DocDueDate;
            }
          }
        }
      }

      // Validación estricta con Zod
      const result = SapB1OrderSchema.safeParse(rawOrder);

      if (!result.success) {
        // DocType es un valor FIJO (el prompt le pide al modelo devolver siempre
        // "dDocument_Items", sin relación con el contenido del PDF — ver
        // prompt-generation.ts). Si es el ÚNICO campo que falló, es una alucinación
        // puntual del modelo de visión, no un problema real del documento ni del
        // schema: reintentar la MISMA llamada antes de rendirse (ver MAX_DOCTYPE_RETRIES).
        const soloFalloDocType =
          result.error.issues.length === 1 && result.error.issues[0].path.join(".") === "DocType";
        if (soloFalloDocType && attempt < MAX_DOCTYPE_RETRIES) {
          console.warn(
            `[parse] DocType inválido en intento ${attempt + 1}/${MAX_DOCTYPE_RETRIES + 1} ` +
            `(campo fijo, no depende del PDF) — reintentando la misma llamada...`
          );
          continue;
        }

        const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join(" | ");
        return [null, `Error de validación AI: ${issues}`, usage];
      }

      return [result.data, "OK", usage];
    } catch (e) {
      return [null, `JSON parse error: ${String(e).slice(0, 80)} | Respuesta: ${clean.slice(0, 200)}`, usage];
    }
  }

  // Inalcanzable en la práctica: el loop siempre retorna en su última iteración
  // (attempt === MAX_DOCTYPE_RETRIES nunca cumple `attempt < MAX_DOCTYPE_RETRIES`).
  return [null, "Error de validación AI: reintentos de DocType agotados", lastUsage];
}

// ── DB helpers ───────────────────────────────────────────────────────────────

function insertSapOrder(
  db: ReturnType<typeof getDb>,
  order: SapB1Order,
  carpeta: string,
  clienteNombre: string
): void {
  const now = new Date().toISOString();
  const prefix = getConfig().cardCodePrefix;
  const nit = order.CardCode.startsWith(prefix) ? order.CardCode.slice(prefix.length) : order.CardCode;
  const fechaP = yyyymmddToIso(order.DocDate);
  const fechaG = yyyymmddToIso(order.DocDueDate);

  // Calcular subtotal antes de insertar para poder escribir maestro primero (FK requiere maestro antes que detalle)
  let subtotalTotal = 0;
  const lineas = order.DocumentLines.map(line => {
    const precio = line.UnitPrice ?? 0;
    const subtotalLinea = precio * line.Quantity;
    subtotalTotal += subtotalLinea;
    return {
      oc: order.NumAtCard,
      sku: line.SupplierCatNum,
      desc: line.FreeText ?? "",
      qty: line.Quantity,
      precio,
      subtotalLinea,
      fechaLinea: line.DeliveryDate ? yyyymmddToIso(line.DeliveryDate) : fechaG,
    };
  });

  db.prepare(`
    INSERT OR REPLACE INTO pedidos_maestro
      (nit_cliente, orden_compra, fecha_solicitado, fecha_entrega_general,
       cliente_nombre, subtotal, notas, estado, ts_parsed, fase_actual, carpeta_origen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `).run(nit, order.NumAtCard, fechaP, fechaG, clienteNombre, subtotalTotal, `TaxDate:${order.TaxDate}`, OrderStatus.PARSED, now, carpeta);

  db.prepare("DELETE FROM pedidos_detalle WHERE orden_compra = ?").run(order.NumAtCard);

  const ins = db.prepare(`
    INSERT INTO pedidos_detalle
      (orden_compra, codigo_producto, descripcion, cantidad, precio_unitario, subtotal_item, fecha_entrega)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const l of lineas) {
    ins.run(l.oc, l.sku, l.desc, l.qty, l.precio, l.subtotalLinea, l.fechaLinea);
  }
}

// esDirigidoAEmpresa y detectClientFromPdf importados desde lib/pdf-classify.ts



// Clave única de un PDF en error: carpeta del correo + nombre del PDF (sin extensión).
// Debe ser la MISMA fórmula usada para insertar en pedidos_maestro (registerParseErrorInDb)
// y para el contenido de `.done` cuando el PDF queda en error (ver run()) — si difieren, el
// check "¿sigue esta OC en la BD?" de más abajo nunca encuentra el registro real y dispara
// un reproceso fantasma en cada corrida (bug real, confirmado en producción: 705 corridas
// repitiendo "reprocesando (registro DB eliminado)" desde 2026-08-18 sin nunca reprocesar de
// verdad, para docenas de PDFs ya en ERROR_PARSE).
function pseudoOcDePdfEnError(carpetaNombre: string, pdfFile: string): string {
  return `${carpetaNombre.slice(0, 40)}_${pdfFile.replace(/\.[^.]+$/, "").slice(0, 15)}`;
}

/**
 * Cuando un PDF alcanza el límite de retries, crea un registro de error en la DB
 * para que step6 lo notifique y step7 archive el correo. Sin esto, el correo queda
 * indefinidamente en staging sin ningún rastro en el dashboard.
 */
function registerParseErrorInDb(
  db: ReturnType<typeof getDb>,
  carpetaPath: string,
  carpetaNombre: string,
  pdfFile: string,
  clienteNombre: string,
  errorMsg: string,
): void {
  try {
    const pseudoOc = pseudoOcDePdfEnError(carpetaNombre, pdfFile);

    // Sub-folder de error: step7 necesita correo_metadata.json para archivar el correo
    const errorFolder = path.join(carpetaPath, pseudoOc);
    fs.mkdirSync(errorFolder, { recursive: true });
    const metaSrc = path.join(carpetaPath, "correo_metadata.json");
    if (fs.existsSync(metaSrc)) {
      fs.copyFileSync(metaSrc, path.join(errorFolder, "correo_metadata.json"));
    }

    db.prepare(`
      INSERT OR IGNORE INTO pedidos_maestro
        (nit_cliente, orden_compra, cliente_nombre, estado, error_msg, fase_actual, carpeta_origen)
      VALUES ('0', ?, ?, 'ERROR_PARSE', ?, 1, ?)
    `).run(pseudoOc, clienteNombre, errorMsg.slice(0, 250), errorFolder);
  } catch { /* no bloquear si ya existe el registro */ }
}

// ── Main ─────────────────────────────────────────────────────────────────────

export async function run(): Promise<StepResult> {
  const config = getConfig();
  const result: StepResult = { procesados: 0, errores: 0, saltados: 0, detalles: [] };

  if (!fs.existsSync(config.pedidosRawDir)) {
    result.detalles.push("No existe pedidos/raw. Ejecuta step0 primero.");
    return result;
  }

  const db = getDb();

  // Cargar clientes y prompts desde la DB (única fuente). Sin clientes → listas vacías.
  let clientesDb: Array<{ carpeta: string; nombre: string; prompt: string }> = [];
  let clientNits: Array<{ carpeta: string; nits: string[] }> = [];
  let clientKeywords: Array<{ carpeta: string; keywords: string[] }> = [];
  try {
    const rows = getClientes(db);
    if (rows.length > 0) {
      clientesDb = rows.filter(r => r.activo === 1).map(r => ({
        carpeta: r.carpeta,
        nombre:  r.nombre,
        prompt:  r.prompt,
      }));
      const lists = loadClientListsFromDb(db);
      clientNits     = lists.nits;
      clientKeywords = lists.keywords;
    }
  } catch { /* DB podría no tener tabla aún */ }

  const CLIENTES = clientesDb.length > 0 ? clientesDb : [];
  const CARPETAS_A_ESCANEAR = [...CLIENTES.map(c => c.carpeta), "Otros"];

  const pdfParseFn = require("pdf-parse/lib/pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

  for (const carpeta of CARPETAS_A_ESCANEAR) {
    const clienteDir = path.join(config.pedidosRawDir, carpeta);
    if (!fs.existsSync(clienteDir)) continue;

    for (const carpetaNombre of fs.readdirSync(clienteDir).sort()) {
      const carpetaPath = path.join(clienteDir, carpetaNombre);
      if (!fs.statSync(carpetaPath).isDirectory()) continue;

      // Solo carpetas de correo. IMAP escribe .eml; Microsoft Graph escribe .txt.
      const isEmailFolder =
        fs.existsSync(path.join(carpetaPath, "correo_original.eml")) ||
        fs.existsSync(path.join(carpetaPath, "correo_original.txt"));
      if (!isEmailFolder) continue;

      const pdfs = fs.readdirSync(carpetaPath).filter(f => f.toLowerCase().endsWith(".pdf"));
      if (!pdfs.length) continue;

      // Procesar TODOS los PDFs del correo — cada uno puede ser una OC distinta
      for (const pdfFile of pdfs) {
        const skipMarker  = path.join(carpetaPath, `${pdfFile}.skip`);
        const doneMarker  = path.join(carpetaPath, `${pdfFile}.done`);
        const retriesPath = path.join(carpetaPath, `${pdfFile}.retries`);
        const errorPath   = path.join(carpetaPath, `${pdfFile}.error`);

        // Idempotencia por PDF: ya fue procesado o descartado explícitamente
        if (fs.existsSync(skipMarker)) {
          result.saltados++;
          continue;
        }
        if (fs.existsSync(doneMarker)) {
          // Si el .done existe pero el registro en BD fue borrado (ej. limpieza manual
          // del dashboard), borrar el marcador para que el pipeline lo reprocese y
          // genere la notificación correspondiente. Invariante: ningún PDF sin notificación.
          const ocFromDone = fs.readFileSync(doneMarker, "utf8").trim();
          const existeEnDb = ocFromDone
            ? db.prepare("SELECT 1 FROM pedidos_maestro WHERE orden_compra = ?").get(ocFromDone)
            : true;
          if (!existeEnDb) {
            fs.rmSync(doneMarker, { force: true });
            // El registro (éxito o error) ya no está en la BD: para que sea un reproceso
            // de verdad hay que limpiar también el estado de error/retries — si no, la
            // siguiente línea (chequeo de errorPath) vuelve a saltar el PDF sin reprocesarlo,
            // dejando el pipeline en un loop silencioso que repite este mensaje cada corrida
            // sin avanzar nunca (bug real confirmado en producción, ver pseudoOcDePdfEnError).
            fs.rmSync(errorPath, { force: true });
            fs.rmSync(retriesPath, { force: true });
            result.detalles.push(`↩ ${carpeta}/${carpetaNombre}/${pdfFile}: reprocesando (registro DB eliminado)`);
          } else {
            result.saltados++;
            continue;
          }
        }

        if (fs.existsSync(errorPath)) {
          result.saltados++;
          // Guardar la MISMA clave que registerParseErrorInDb insertó en pedidos_maestro,
          // no un sentinel literal — si no coinciden, el chequeo de arriba nunca encuentra
          // el registro real y dispara un reproceso fantasma en cada corrida futura.
          fs.writeFileSync(doneMarker, pseudoOcDePdfEnError(carpetaNombre, pdfFile));
          continue;
        }

        // El triage IA de step0 ya identificó este adjunto como "no es una OC" con
        // una razón concreta — no gastar una llamada al modelo para que llegue a la
        // misma conclusión de peor manera (JSON con campos vacíos, ver getTriageTipo).
        const triage = getTriageTipo(carpetaPath, pdfFile);
        if (triage?.tipo === "documento_relevante") {
          result.errores++;
          result.detalles.push(`  → Triage: no es una OC — ${triage.razon}`);
          logPipeline(db, carpetaNombre, 1, "parse", "ERROR", `${pdfFile}: triage clasificó como documento_relevante — ${triage.razon}`);
          fs.writeFileSync(skipMarker, "triage-not-po");
          registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, triage.cliente ?? carpeta, `Adjunto no es una OC — requiere revisión manual: ${triage.razon}`);
          continue;
        }

        result.detalles.push(`Procesando: ${carpeta}/${carpetaNombre}/${pdfFile}`);

        try {
          const buffer = fs.readFileSync(path.join(carpetaPath, pdfFile));
          const parsed = await pdfParseFn(buffer);
          const pdfText = parsed.text ?? '';
          const textIsEmpty = pdfText.trim().length < 50;

          // ── Detectar cliente desde el PDF; si texto vacío usar carpeta del correo ──
          const detectedCarpeta = !textIsEmpty
            ? detectClientFromPdf(pdfText, clientNits, clientKeywords)?.carpeta ?? null
            : carpeta;
          const clienteInfo = CLIENTES.find(c => c.carpeta === (detectedCarpeta ?? carpeta));

          // PDF no dirigido a la empresa receptora → registrar ERROR_PARSE y continuar.
          if (!textIsEmpty && !esDirigidoAEmpresa(pdfText, config.receptorKeywords)) {
            result.errores++;
            result.detalles.push(`  → No dirigido a ${config.tenant} — omitido`);
            logPipeline(db, carpetaNombre, 1, "parse", "ERROR", `${pdfFile}: no dirigido a ${config.tenant}`);
            fs.writeFileSync(skipMarker, "");
            registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, clienteInfo?.nombre ?? carpeta, `El PDF recibido no está dirigido a la empresa receptora (${config.tenantDisplayName}).`);
            continue;
          }

          if (!clienteInfo) {
            result.errores++;
            result.detalles.push(`  ⚠ No se identificó cliente en el PDF — omitido (carpeta email: ${carpeta})`);
            logPipeline(db, carpetaNombre, 1, "parse", "ERROR", `${pdfFile}: cliente no detectado en PDF`);
            fs.writeFileSync(skipMarker, "no-client-detected");
            registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, carpeta, `No se pudo identificar a qué cliente aprobado corresponde el PDF.`);
            continue;
          }

          if (detectedCarpeta !== carpeta) {
            result.detalles.push(`  ⚠ Mismatch: correo en carpeta "${carpeta}", PDF identifica cliente "${detectedCarpeta}" — usando prompt correcto`);
            logPipeline(db, carpetaNombre, 1, "parse", "WARN", `${pdfFile}: carpeta=${carpeta} pdf_cliente=${detectedCarpeta}`);
          }

          const [order, status, usage] = await parseWithAI(buffer, clienteInfo.prompt);

          if (!order) {
            result.errores++;
            result.detalles.push(`  ✗ ${status}`);
            logPipeline(db, carpetaNombre, 1, "parse", "ERROR", `AI parse fallido: ${status}`, usage.input, usage.output, PARSE_MODEL);
            const retries = fs.existsSync(retriesPath)
              ? parseInt(fs.readFileSync(retriesPath, "utf8") || "0") + 1 : 1;
            if (retries >= 3) {
              fs.writeFileSync(errorPath, status);
              fs.rmSync(retriesPath, { force: true });
              registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, clienteInfo?.nombre ?? carpeta, status);
            } else {
              fs.writeFileSync(retriesPath, String(retries));
            }
            continue;
          }

          // DocDate siempre es la fecha de hoy — no depender del AI
          const hoy = new Date();
          order.DocDate = `${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,"0")}${String(hoy.getDate()).padStart(2,"0")}`;

          // Normalizar NumAtCard: quitar espacios extremos y colapsar espacios internos múltiples.
          // Claude puede extraer "Y-  1 -  18418" o "Y- 1 -  18418" del mismo PDF — sin
          // normalización el sistema los trata como OC distintas y sube duplicados a SAP.
          order.NumAtCard = order.NumAtCard.trim().replace(/\s+/g, " ");

          // Sub-folder por OC: carpeta_origen independiente para cada pedido del correo
          const ocFolder = path.join(carpetaPath, order.NumAtCard);
          fs.mkdirSync(ocFolder, { recursive: true });

          // Copiar correo_metadata.json al sub-folder (step7 lo necesita para IMAP)
          const metaSrc = path.join(carpetaPath, "correo_metadata.json");
          if (fs.existsSync(metaSrc)) {
            fs.copyFileSync(metaSrc, path.join(ocFolder, "correo_metadata.json"));
          }

          // Reproceso intencional: el INBOX es la fuente de verdad. Si el cliente devuelve
          // un correo a la bandeja de entrada, step0 lo descarga en una carpeta NUEVA (sin
          // .done) y el pedido debe procesarse desde cero AUNQUE su OC ya esté CERRADA en la
          // DB — típicamente porque la primera vez falló en SAP y el cliente lo reenvía para
          // reintentar. NO se filtra aquí por estado previo.
          //
          // La protección contra pedidos duplicados en SAP NO depende de este step: step4
          // hace un pre-check (GET /Orders por NumAtCard+CardCode) antes de postear y, además,
          // SAP mismo rechaza una OC ya existente. El .done por carpeta evita el reproceso
          // accidental de la MISMA carpeta en corridas normales.
          // Guard anti-colisión entre clientes: NumAtCard NO es único globalmente, dos
          // clientes distintos podrían reutilizar el mismo número de OC. El INSERT OR REPLACE
          // de insertSapOrder reemplaza por orden_compra, así que sobreescribiría el pedido
          // del otro cliente. Si ya existe una fila con esta OC pero de OTRO nit_cliente, no
          // es un reproceso legítimo (un reenvío siempre trae el mismo cliente): se deriva a
          // revisión manual en lugar de pisar datos ajenos.
          const prefixCfg = getConfig().cardCodePrefix;
          const nitActual = order!.CardCode.startsWith(prefixCfg)
            ? order!.CardCode.slice(prefixCfg.length) : order!.CardCode;
          const colision = db.prepare(
            `SELECT nit_cliente, cliente_nombre FROM pedidos_maestro WHERE orden_compra = ? AND nit_cliente <> ?`
          ).get(order!.NumAtCard, nitActual) as { nit_cliente: string; cliente_nombre: string } | undefined;
          if (colision) {
            const msg = `Colisión de OC ${order!.NumAtCard}: ya existe para otro cliente (${colision.cliente_nombre}, NIT ${colision.nit_cliente}). Revisión manual.`;
            registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, clienteInfo.nombre, msg);
            fs.writeFileSync(doneMarker, order!.NumAtCard);
            fs.rmSync(retriesPath, { force: true });
            result.saltados++;
            result.detalles.push(`  ⚠ ${msg}`);
            logPipeline(db, order!.NumAtCard, 1, "parse", "ERROR", msg);
            continue;
          }

          const costoIaUsd = estimateCostUsd(PARSE_MODEL, usage.input ?? 0, usage.output ?? 0);

          const tx = db.transaction(() => {
            insertSapOrder(db, order, ocFolder, clienteInfo.nombre);
            db.prepare(`UPDATE pedidos_maestro SET costo_ia_usd=COALESCE(costo_ia_usd, 0)+? WHERE orden_compra=?`)
              .run(costoIaUsd, order.NumAtCard);
            logPipeline(db, order.NumAtCard, 1, "parse", "OK", `PDF: ${pdfFile}`, usage.input, usage.output, PARSE_MODEL);
          });
          tx();

          fs.writeFileSync(
            path.join(ocFolder, "data_extraida.json"),
            JSON.stringify({ ...order, pdf: pdfFile, ts: new Date().toISOString() }, null, 2)
          );

          // Marker de éxito en la carpeta del correo (referencia la OC)
          fs.writeFileSync(doneMarker, order.NumAtCard);
          fs.rmSync(retriesPath, { force: true });

          result.procesados++;
          result.detalles.push(`  ✓ OC ${order.NumAtCard} → PARSED (${order.DocumentLines.length} items)`);
        } catch (e) {
          result.errores++;
          result.detalles.push(`  ✗ Error en ${pdfFile}: ${String(e)}`);
          const retries = fs.existsSync(retriesPath)
            ? parseInt(fs.readFileSync(retriesPath, "utf8") || "0") + 1 : 1;
          if (retries >= 3) {
            fs.writeFileSync(errorPath, errToMsg(e));
            fs.rmSync(retriesPath, { force: true });
            registerParseErrorInDb(db, carpetaPath, carpetaNombre, pdfFile, carpeta, errToMsg(e));
          } else {
            fs.writeFileSync(retriesPath, String(retries));
          }
        }
      }
    }
  }

  return result;
}
