/**
 * Clasificación de PDFs por contenido: identificación de cliente aprobado
 * y verificación de que el documento está dirigido a la empresa receptora.
 *
 * Fuente de verdad compartida entre step0 (pre-triage) y step1 (parse).
 */

import type { TriageResult } from "./ai-triage";

// ── Detección de empresa receptora ────────────────────────────────────────────
// Las palabras clave de la empresa receptora vienen de la env var RECEPTOR_KEYWORDS
// (ver lib/config.ts → config.receptorKeywords). No hay listas por tenant en código.

/** Verifica si el PDF está dirigido a la empresa cuyas keywords se pasan. */
export function esDirigidoAEmpresa(pdfText: string, keywords: string[]): boolean {
  const lower = pdfText.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// Los clientes aprobados (NITs, keywords, prompt) viven en la tabla clientes_aprobados
// de la DB de cada tenant — única fuente de verdad. No hay listas de clientes en código:
// un tenant nuevo arranca sin clientes y los va agregando uno por uno desde el dashboard.

export interface ClientDetection {
  carpeta: string;
  metodo: 'nit' | 'keyword';
}

/**
 * Detecta el cliente aprobado a partir del texto extraído de un PDF, usando las listas
 * cargadas desde la DB (ver loadClientListsFromDb). Si no se pasan listas (DB vacía),
 * no detecta ningún cliente.
 *
 * Paso 1: busca NIT normalizado (quita puntos para matchear "800.069.933" = "800069933").
 * Paso 2: keywords de marca como fallback (solo si no hay NIT).
 */
export function detectClientFromPdf(
  pdfText: string,
  clientNits: Array<{ carpeta: string; nits: string[] }> = [],
  clientKeywords: Array<{ carpeta: string; keywords: string[] }> = [],
): ClientDetection | null {
  const normalized = pdfText.replace(/\./g, "");
  // Los NIT en la DB son de 9 dígitos (sin dígito de verificación). Se busca el NIT como
  // substring del texto normalizado: así se tolera que el PDF traiga el DV pegado
  // ("8000699330") o con guion ("800069933-0") — solo importan las 9 cifras.
  for (const { carpeta, nits } of clientNits) {
    if (nits.some(nit => normalized.includes(nit))) return { carpeta, metodo: 'nit' };
  }

  const lower = pdfText.toLowerCase();
  for (const { carpeta, keywords } of clientKeywords) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) return { carpeta, metodo: 'keyword' };
  }

  return null;
}

interface ClasificacionAjustable {
  client: string | null;
  isDirigidoAEmpresa: boolean;
  isApprovedOC: boolean;
  detectionMethod: 'nit' | 'keyword' | null;
}

/**
 * Ajusta la clasificación heurística (NIT/keyword) según el veredicto del triage IA.
 *
 * Prioridad: el NIT del documento es la señal confiable por sí sola (la propia IA lo
 * prioriza, ver ai-triage.ts) — no necesita confirmación para quedar aprobado, y la IA
 * solo puede ELEVARLO (nunca degradarlo).
 *
 * La keyword, en cambio, es una señal débil — puede matchear texto ajeno al cliente
 * real (ej. el apellido de una persona en una firma de correo, o el nombre de otra
 * empresa con razón social similar) — y por diseño SIEMPRE requiere que la IA la
 * confirme, incluida la ausencia de veredicto: si el triage IA no está disponible para
 * este adjunto (servicio caído, sin saldo, etc.), no hay con qué confirmar la keyword,
 * así que se demota a revisión manual en vez de aprobarla a ciegas. Esto es intencional:
 * durante una caída del servicio de IA, los clientes detectados solo por NIT siguen
 * procesándose normalmente; los detectados solo por keyword se pausan hasta que la IA
 * vuelva a estar disponible, en vez de arriesgar un pedido mal atribuido.
 */
export function ajustarClasificacionPorTriage<T extends ClasificacionAjustable>(
  pdf: T,
  ia: TriageResult | undefined,
  clientNits: Array<{ carpeta: string; nits: string[] }>,
): T {
  if (pdf.detectionMethod === "nit") {
    if (ia && !pdf.isApprovedOC && ia.tipo === "orden_compra") return { ...pdf, isApprovedOC: true };
    return pdf;
  }

  if (pdf.detectionMethod === "keyword") {
    if (!ia) return { ...pdf, isApprovedOC: false };
    if (ia.tipo !== "orden_compra") return { ...pdf, isApprovedOC: false };
    if (ia.cliente && ia.cliente !== pdf.client) {
      return { ...pdf, client: ia.cliente, isApprovedOC: pdf.isDirigidoAEmpresa };
    }
    if (!ia.cliente) return { ...pdf, isApprovedOC: false };
    return pdf;
  }

  if (!ia) return pdf;

  if (pdf.detectionMethod === null && ia.tipo === "orden_compra" && ia.cliente) {
    const clientExists = clientNits.some(c => c.carpeta === ia.cliente);
    if (clientExists) return { ...pdf, client: ia.cliente, isApprovedOC: true };
  }

  return pdf;
}

/**
 * Carga las listas de clientes desde la DB para la detección dinámica.
 * La DB es la única fuente: si no hay clientes (o falla la consulta) retorna listas vacías.
 */
export function loadClientListsFromDb(db: import("better-sqlite3").Database): {
  nits: Array<{ carpeta: string; nits: string[]; nombre?: string }>;
  keywords: Array<{ carpeta: string; keywords: string[] }>;
} {
  try {
    const rows = db.prepare(
      "SELECT carpeta, nombre, nits_json, keywords_json FROM clientes_aprobados WHERE activo = 1 ORDER BY nombre ASC"
    ).all() as Array<{ carpeta: string; nombre: string; nits_json: string; keywords_json: string }>;
    return {
      nits: rows.map(r => {
        try { return { carpeta: r.carpeta, nombre: r.nombre, nits: JSON.parse(r.nits_json) as string[] } }
        catch { console.warn(`pdf-classify: nits_json inválido para cliente ${r.carpeta}`); return { carpeta: r.carpeta, nombre: r.nombre, nits: [] } }
      }),
      keywords: rows.map(r => {
        try { return { carpeta: r.carpeta, keywords: JSON.parse(r.keywords_json) as string[] } }
        catch { console.warn(`pdf-classify: keywords_json inválido para cliente ${r.carpeta}`); return { carpeta: r.carpeta, keywords: [] } }
      }),
    };
  } catch {
    return { nits: [], keywords: [] };
  }
}
