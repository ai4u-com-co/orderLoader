/**
 * Genera prompts específicos para todos los clientes de FlexoImpresos.
 * Analiza los PDFs reales de las carpetas scratch y guarda directo en la BD.
 *
 * Cubre ambas carpetas:
 *   - scratch/flexoimpresos-oc/listadeclientesconpdfflexoimpresos   (24 PDFs)
 *   - scratch/flexoimpresos-oc/relistadeclientesconpdfflexoimpresos (32 PDFs)
 *
 * Uso:
 *   npx tsx scripts/generate-prompts-all.ts
 *   npx tsx scripts/generate-prompts-all.ts --dry-run   (solo muestra qué procesaría)
 *   npx tsx scripts/generate-prompts-all.ts --client Doria  (solo un cliente)
 */

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { pdfToImages, buildVisionContent } from "../lib/pdf-vision";
import { getDb, getClientes, updateCliente } from "../lib/db";

const BASE = path.resolve(__dirname, "../scratch/flexoimpresos-oc");
const FOLDER_LIST   = path.join(BASE, "listadeclientesconpdfflexoimpresos");
const FOLDER_RELIST = path.join(BASE, "relistadeclientesconpdfflexoimpresos");

// Mapeo completo PDF → carpeta (DB). Un solo PDF por cliente; si hay dos se usa el primero.
const PDF_MAP: Array<{ folder: string; file: string; carpeta: string }> = [
  // ── listadeclientesconpdfflexoimpresos ──────────────────────────────────
  { folder: FOLDER_LIST, file: "OR 2220 Flexoimpresos (AKITA MOTOS S.A.).pdf",                                           carpeta: "AkitaMotos" },
  { folder: FOLDER_LIST, file: "OC529 Flexoimpresos (ALIMENTOS NEBRASKA S.A.S.).pdf",                                    carpeta: "AlimentosNebraska" },
  { folder: FOLDER_LIST, file: "FLEXO IMPRESOS (AMENI GROUP S.A.S).pdf",                                                 carpeta: "AmeniGroup" },
  { folder: FOLDER_LIST, file: "OC FLEXO IMPRESOS 4700112434 (AUTECO MOBILITY S.A.S.).pdf",                              carpeta: "AutocoMobility" },
  { folder: FOLDER_LIST, file: "OC  4100063497 - FLEXO IMPRESOS SAS - Rionegro (AUTOTECNICA COLOMBIANA S.A.S.).pdf",     carpeta: "AutotecnicaColombiana" },
  { folder: FOLDER_LIST, file: "13_001OC19714_952026_093941 (CARNICOS Y ALIMENTOS S.A.S.).pdf",                          carpeta: "CarnicosAlimentos" },
  { folder: FOLDER_LIST, file: "ORDEN DE COMPRA 10644 FLEXO IMPRESOS (CEDIMED S.A.S.).pdf",                              carpeta: "Cedimed" },
  { folder: FOLDER_LIST, file: "03-189466 (CLINICA CARDIO VID).PDF",                                                     carpeta: "ClinicaCardioVid" },
  { folder: FOLDER_LIST, file: "CC00-4501973664 (COMPAÑIA COLOMBIANA DE CERAMICAS S A S).pdf",                           carpeta: "ColombianaCeramicas" },
  { folder: FOLDER_LIST, file: "18881 (COLOMBIANA DE PRODUCTOS DEL AGRO COLPAGRO S.A.S).pdf",                            carpeta: "Colpagro" },
  { folder: FOLDER_LIST, file: "1_100COC1694_ (COSMETICOS SAMY S.A.).pdf",                                               carpeta: "CosmeticosSamy" },
  { folder: FOLDER_LIST, file: "Y1-18356 FLEXOIMPRESOS (CRUZ ROJA COLOMBIANA SECCIONAL ANTIOQUIA).pdf",                  carpeta: "CruzRoja" },
  { folder: FOLDER_LIST, file: "PO_4500678794 (CRYSTAL S.A.S).PDF",                                                      carpeta: "Crystal" },
  { folder: FOLDER_LIST, file: "ORDEN_DE_COM_4500404118 (CUEROS VELEZ S.A.S.).pdf",                                      carpeta: "CuerosVelez" },
  { folder: FOLDER_LIST, file: "FO-CO-03 ORDEN DE COMPRA FLEXO IMPRESOS 260408 (DISPROASEO S.A.S.).pdf",                 carpeta: "Disproaseo" },
  { folder: FOLDER_LIST, file: "O.C # 044 Flexo impreso (ELITE MAX NUTRITION S.A.S.).pdf",                               carpeta: "EliteMaxNutrition" },
  { folder: FOLDER_LIST, file: "O.C 5002231 FLEXO IMPRESOS (EMPRESA DE COSMETICOS Y SERVICIOS S.A.).pdf",                carpeta: "EmpresaCosmeticos" },
  { folder: FOLDER_LIST, file: "OC 73961 (EXTRUSIONES S.A.).pdf",                                                        carpeta: "Extrusiones" },
  { folder: FOLDER_LIST, file: "4502562937 (FAMILIA DEL PACIFICO S . A . S).pdf",                                        carpeta: "FamiliaDelPacifico" },
  { folder: FOLDER_LIST, file: "2502 FLEXOIMPRESOS (GROPIUS INNOVACIÓN SOCIEDAD POR ACCIONES SIMPLIFICADA).pdf",         carpeta: "Gropius" },
  { folder: FOLDER_LIST, file: "GROUPE SEB - OC 9850230662, CONFIRMAR FECHA DE ENT (GROUPE SEB COLOMBIA S.A.).pdf",      carpeta: "GroupeSeb" },

  // ── relistadeclientesconpdfflexoimpresos ────────────────────────────────
  { folder: FOLDER_RELIST, file: "OC C03 4500032777 FLEXO IMPRESOS S.A.S (MANE ANDINA S.A.S.).PDF",                      carpeta: "ManeAndina" },
  { folder: FOLDER_RELIST, file: "45007407 FLEXOIMPRESOS (MCM).pdf",                                                     carpeta: "McmCompany" },
  { folder: FOLDER_RELIST, file: "1_001OCN98954_ (NEW STETIC).pdf",                                                      carpeta: "NewStetic" },
  { folder: FOLDER_RELIST, file: "OC6494 FLEXO IMP (PLASTICOS Y CAUCHOS S.A. PLACA).pdf",                                carpeta: "Placa" },
  { folder: FOLDER_RELIST, file: "OC- 251796- FUNDA KIA 30ML (POLIKEM S.A.S.).pdf",                                      carpeta: "Polikem" },
  { folder: FOLDER_RELIST, file: "OC70813 (PRODIA S.A.S).pdf",                                                           carpeta: "Prodia" },
  { folder: FOLDER_RELIST, file: "4503358220 (DORIA).pdf",                                                               carpeta: "Doria" },
  { folder: FOLDER_RELIST, file: "986288 Cinta Promocional Gratis Este Producto - Flexo Impresos (YUPI).pdf",            carpeta: "Yupi" },
  { folder: FOLDER_RELIST, file: "Orden de compra - P03987 (PROPLAS S.A.).pdf",                                          carpeta: "Proplas" },
  { folder: FOLDER_RELIST, file: "ORDEN_DE_COMPRA_RC2_PHARMA_RC-1565 (RC2 PHARMACEUTICAL S.A.S.).pdf",                   carpeta: "Rc2Pharma" },
  { folder: FOLDER_RELIST, file: "OC12787 FLEXO IMPRESOS (SAMARA COSMETICS S.A.S.).pdf",                                 carpeta: "SamaraCosmetics" },
  { folder: FOLDER_RELIST, file: "ORCOM 9303 FLEXO IMPRESO (SELLO GLOBAL SAS).pdf",                                      carpeta: "SelloGlobal" },
  { folder: FOLDER_RELIST, file: "4503372688 (SETAS COLOMBIANAS S.A. SETAS S.A.).pdf",                                   carpeta: "SetasColombianas" },
  { folder: FOLDER_RELIST, file: "OC2021 FLEXO IMPRESOS - FUNDAS TERMOGENICAS  (SOLUCIONES E INNOVACION EN ALIMENTOS COLOMBIA S.A.S.).pdf", carpeta: "SolucionesInnovacion" },
  { folder: FOLDER_RELIST, file: "4320536155 (SUN CHEMICAL COLOMBIA S.A.S.).pdf",                                        carpeta: "SunChemical" },
  { folder: FOLDER_RELIST, file: "Orden de Compra # 1370 FLEXOIMPRESOS Marzo 31-2026 (TRAMAS LITOGRAFIA SAS).pdf",       carpeta: "TramasLitografia" },
  { folder: FOLDER_RELIST, file: "OC 12820 FLEXO IMPRESOS (IMPROBELL SOCIEDAD POR ACCIONES SIMPLIFICADA).pdf",           carpeta: "Improbell" },
  { folder: FOLDER_RELIST, file: "OP 26000759 FLEXO (INCAMETAL S.A.S.).pdf",                                             carpeta: "Incametal" },
  { folder: FOLDER_RELIST, file: "O.C# 10451 FLEXOIMPRESOS (INDUSTRIAS FROTEX).pdf",                                     carpeta: "IndustriasFrotex" },
  { folder: FOLDER_RELIST, file: "OC 12389 (INTERDOORS S.A.S).pdf",                                                      carpeta: "Interdoors" },
  { folder: FOLDER_RELIST, file: "OC 12322 FLEXOIMPRESO (INTERNACIONAL DE BELLEZA S.A.S.).pdf",                          carpeta: "InternacionalBelleza" },
  { folder: FOLDER_RELIST, file: "OC 312- FLEXOIMPRESOS (KYMIA S.A.S).pdf",                                              carpeta: "Kymia" },
  { folder: FOLDER_RELIST, file: "70070735 (LABORATORIOS ECAR S.A).pdf",                                                 carpeta: "LaboratoriosEcar" },
  { folder: FOLDER_RELIST, file: "OP 26000759 FLEXO (LANDERS Y CIA SAS).pdf",                                            carpeta: "LandersYCia" },
  { folder: FOLDER_RELIST, file: "ORDEN DE COMPRA 7274 FLEXO IMPRESOS (MACROLAB ASOCIADOS S.A.S.).pdf",                  carpeta: "Macrolab" },
];

const META_PROMPT = `Eres un experto en diseñar prompts para extracción estructurada de órdenes de compra a JSON.

Te muestro UN PDF real de una orden de compra dirigida a FLEXO IMPRESOS S.A.S. (NIT 900528680). Analízalo cuidadosamente y genera un prompt de extracción ALTAMENTE ESPECÍFICO para este cliente, siguiendo este formato exacto:

\`\`\`
# PURCHASE ORDER EXTRACTION AGENT — FLEXO IMPRESOS

## ROLE
You are a Purchase Order Analyzer specialized in extracting structured information from purchase documents directed to FLEXO IMPRESOS S.A.S. (NIT 900528680) and converting it to JSON format with absolute precision.

## OBJECTIVE
Analyze the provided purchase order document from {{NOMBRE}} and generate a JSON object following the SAP B1 schema exactly.

## EXTRACTION PROCESS

### 1. INITIAL ANALYSIS
* Examine the purchase order document completely
* Identify and count the total number of unique items/products
* Mentally record this for validation

### 2. DATA EXTRACTION
* **Order number (NumAtCard)**: <DESCRIBE EL CAMPO REAL: nombre de campo en el PDF, si tiene prefijo como "OC", "OR", "OCN", etc. Instrucciones para copiar exacto incluyendo prefijo>
* **Document date (DocDate)**: Always use today's processing date in YYYYMMDD format (NOT from the document)
* **Due date (DocDueDate)**: <CAMPO REAL del PDF, ej. "Fecha de entrega", "Llegada esperada", "Delivery date">. If not found, use DocDate + 15 days.
* **Tax date (TaxDate)**: <CAMPO REAL: fecha de emisión/elaboración del documento>. If not found, use DocDate.
* **Observations (Comments)**: <Sección real del doc, ej. "Observaciones", "Notas", "Instrucciones especiales". Si no existe → 'Use ""'>
* **Items**: For each product line in the SAME ORDER as they appear:
  * Code (SupplierCatNum): <COLUMNA REAL del PDF. Indicar si hay leading zeros que remover>
  * Quantity (Quantity): <COLUMNA REAL>
  * Unit price (UnitPrice): <COLUMNA REAL — explícitamente precio unitario, NO subtotal>
  * Line delivery date (DeliveryDate): <CAMPO REAL por línea o DocDueDate si no existe>
  * Line notes (FreeText): <descripción, color, variante si aplica. Use "" if none>

### 3. MANDATORY TRANSFORMATIONS

**CardCode**: Always use "{{CARDCODE}}" regardless of any value in the document.

**Dates**: Convert ALL dates to YYYYMMDD format.
<Pon 3-4 ejemplos REALES con el formato que usa este cliente en el PDF>

**Numbers — CRITICAL (<COLOMBIAN o AMERICAN format>)**:
<Identifica el formato REAL mirando valores del PDF. Pon reglas con ejemplos reales>

**SupplierCatNum**: <Instrucciones específicas para este cliente — leading zeros, truncar, etc.>

### 4. OUTPUT FORMAT

⚠️ CRITICAL RESPONSE RULE: Your response must start with "{" and end with "}". No analysis, no explanation, no markdown, no preamble. The automated parser will fail if you write anything before or after the JSON object.

\`\`\`json
{
  "DocType": "dDocument_Items",
  "NumAtCard": "<OC number exactly as in document>",
  "CardCode": "{{CARDCODE}}",
  "DocDate": "<today YYYYMMDD>",
  "DocDueDate": "<delivery date YYYYMMDD>",
  "TaxDate": "<document date YYYYMMDD>",
  "Comments": "<observations or empty string>",
  "DocumentLines": [
    {
      "SupplierCatNum": "<item code>",
      "Quantity": <integer>,
      "UnitPrice": <decimal>,
      "DeliveryDate": "<YYYYMMDD>",
      "FreeText": "<line description or empty string>"
    }
  ]
}
\`\`\`

### 5. VALIDATION
Before outputting, silently verify (do NOT write this analysis in your response):
* Number of lines matches the document
* All dates are in YYYYMMDD format
* CardCode is exactly "{{CARDCODE}}"
* All quantities are positive integers
* NumAtCard is present and non-empty
<Añade validaciones específicas de este cliente si aplica>

Then output ONLY the JSON object — nothing else.
\`\`\`

REGLAS ESTRICTAS:
1. Reemplaza TODOS los placeholders <> con valores REALES observados en el PDF.
2. NUNCA dejes placeholders genéricos — cada instrucción debe ser específica para este cliente.
3. Identifica el formato numérico CORRECTO (colombiano: punto=miles, coma=decimal / americano: coma=miles, punto=decimal).
4. Mantén CardCode = "{{CARDCODE}}" y nombre del cliente = "{{NOMBRE}}" exactamente como te los doy.
5. El bloque de output JSON al final del prompt debe mostrar "{{CARDCODE}}" (el valor real, no el placeholder).
6. Salida: SOLO el prompt completo, sin explicación adicional, sin bloques markdown alrededor.

Datos del cliente:
- NOMBRE: {{NOMBRE}}
- CARDCODE: {{CARDCODE}}`;

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const clientFilter = process.argv.includes("--client")
    ? process.argv[process.argv.indexOf("--client") + 1]
    : null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !isDryRun) { console.error("Falta ANTHROPIC_API_KEY"); process.exit(1); }

  const client = apiKey ? new Anthropic({ apiKey }) : null;
  const db = getDb();
  const clientes = getClientes(db);

  const entries = clientFilter
    ? PDF_MAP.filter(e => e.carpeta === clientFilter)
    : PDF_MAP;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Generate Prompts — FlexoImpresos`);
  console.log(`Procesando: ${entries.length} clientes${isDryRun ? " [DRY RUN]" : ""}`);
  console.log("=".repeat(60) + "\n");

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    const cliente = clientes.find(c => c.carpeta === entry.carpeta);
    if (!cliente) {
      errors.push(`${entry.carpeta}: no encontrado en BD`);
      console.log(`  ✗ ${entry.carpeta}: no encontrado en BD`);
      continue;
    }

    const pdfPath = path.join(entry.folder, entry.file);
    const folderName = path.basename(entry.folder);

    if (!fs.existsSync(pdfPath)) {
      errors.push(`${entry.carpeta}: PDF no encontrado — ${entry.file}`);
      console.log(`  ✗ ${entry.carpeta}: PDF no encontrado`);
      skipped++;
      continue;
    }

    console.log(`→ ${entry.carpeta} (${cliente.nombre})`);
    console.log(`   PDF: ${folderName}/${entry.file}`);

    if (isDryRun) {
      console.log(`   [DRY RUN] card_code=${cliente.card_code}\n`);
      continue;
    }

    try {
      const buffer = fs.readFileSync(pdfPath);
      const { pages } = await pdfToImages(buffer);
      const visionContent = buildVisionContent(pages);

      const meta = META_PROMPT
        .replaceAll("{{NOMBRE}}", cliente.nombre)
        .replaceAll("{{CARDCODE}}", cliente.card_code);

      const msg = await client!.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        temperature: 0,
        system: meta,
        messages: [{ role: "user", content: visionContent }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      if (!raw) {
        errors.push(`${entry.carpeta}: respuesta vacía`);
        console.log(`   ✗ respuesta vacía\n`);
        continue;
      }

      // Quitar bloque markdown si Claude lo añadió
      const prompt = raw.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

      if (!prompt.includes("PURCHASE ORDER EXTRACTION AGENT") || !prompt.includes(cliente.card_code)) {
        errors.push(`${entry.carpeta}: prompt generado no parece válido`);
        console.log(`   ✗ prompt inválido (no contiene cardcode o header)\n`);
        continue;
      }

      // Guardar directo en BD
      updateCliente(db, cliente.id, { prompt });
      updated++;
      console.log(`   ✓ ${prompt.length} chars | tokens in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}\n`);

    } catch (e) {
      const msg = String(e).slice(0, 200);
      errors.push(`${entry.carpeta}: ${msg}`);
      console.log(`   ✗ ERROR: ${msg}\n`);
    }
  }

  console.log("=".repeat(60));
  console.log(`Resultado: ${updated} actualizados, ${skipped} saltados, ${errors.length} errores`);
  if (errors.length > 0) {
    console.log("\nErrores:");
    errors.forEach(e => console.log("  • " + e));
  }

  // Clientes sin PDF disponible
  const conPdf = new Set(PDF_MAP.map(e => e.carpeta));
  const sinPdf = clientes.filter(c => c.activo && !conPdf.has(c.carpeta));
  if (sinPdf.length > 0) {
    console.log(`\nClientes sin PDF (${sinPdf.length}) — prompt no actualizado:`);
    sinPdf.forEach(c => console.log(`  • ${c.carpeta} (${c.nombre})`));
  }
}

main().catch(console.error);
