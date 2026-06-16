/**
 * Clasificación de PDFs por contenido: identificación de cliente aprobado
 * y verificación de que el documento está dirigido a la empresa receptora.
 *
 * Fuente de verdad compartida entre step0 (pre-triage) y step1 (parse).
 */

// ── Detección de empresa receptora ────────────────────────────────────────────
//
// FALLBACK TEMPORAL (Fase 2): las palabras clave de la empresa receptora deben venir
// de la env var RECEPTOR_KEYWORDS (ver lib/config.ts). Estas constantes solo se usan
// como respaldo mientras los .env de los VMs no estén poblados.
// TODO (Fase 2c): eliminar estas constantes una vez que cada VM defina RECEPTOR_KEYWORDS.

export const TAMAPRINT_RECEPTOR_KEYWORDS = [
  "tamaprint",
  "tama print",
  "900851655",   // NIT sin dígito de verificación
  "9008516551",  // NIT con dígito de verificación
  "900.851.655", // NIT con puntos
];

export const FLEXO_RECEPTOR_KEYWORDS = [
  "flexo impresos",
  "flexoimpresos",
  "900528680",   // NIT sin dígito de verificación
  "9005286800",  // NIT con dígito de verificación
  "900.528.680", // NIT con puntos
];

/** Genérica: verifica si el PDF está dirigido a la empresa cuyas keywords se pasan. */
export function esDirigidoAEmpresa(pdfText: string, keywords: string[]): boolean {
  const lower = pdfText.toLowerCase();
  return keywords.some(kw => lower.includes(kw.toLowerCase()));
}

// ── Clientes aprobados — NITs (señal principal) ────────────────────────────────

export const CLIENT_NITS: Array<{ carpeta: string; nits: string[] }> = [
  { carpeta: "Comodin",          nits: ["800069933"] },
  { carpeta: "Hermeco",          nits: ["890924167"] },
  { carpeta: "Exito",            nits: ["890900608"] },
  { carpeta: "Eurocorsett",      nits: ["811032857"] },
  { carpeta: "IndustriasCory",   nits: ["800131750"] },
  { carpeta: "EstudioModa",      nits: ["890926803"] },
  { carpeta: "PinturasPrime",    nits: ["800194203"] },
  { carpeta: "Manutex",          nits: ["900426666"] },
  { carpeta: "ElGlobo",          nits: ["800227956"] },
  { carpeta: "ServicioCompleto", nits: ["900690157"] },
  { carpeta: "ICVO",             nits: ["890932892"] },
  { carpeta: "Produempak",       nits: ["900445797"] },
  { carpeta: "Prointimo",        nits: ["811042428"] },
  { carpeta: "Termimoda",        nits: ["900447263"] },
  { carpeta: "Byspro",           nits: ["805018724"] },
  { carpeta: "LaimaSas",         nits: ["900461923"] },
];

// ── Clientes aprobados — keywords de marca (fallback) ─────────────────────────

export const CLIENT_TEXT_KEYWORDS: Array<{ carpeta: string; keywords: string[] }> = [
  { carpeta: "Comodin",          keywords: ["gco", "comodin", "americanino", "gco.com.co"] },
  { carpeta: "Hermeco",          keywords: ["hermeco", "offcorss", "offcorss.com"] },
  { carpeta: "Exito",            keywords: ["grupoexito", "grupo-exito", "grupo exito", "grupo éxito"] },
  { carpeta: "Eurocorsett",      keywords: ["eurocorsett", "eurocorsett.com"] },
  { carpeta: "IndustriasCory",   keywords: ["industrias cory", "industriascory", "cory s.a.s"] },
  { carpeta: "EstudioModa",      keywords: ["estudio de moda", "estudiomoda", "890926803"] },
  { carpeta: "PinturasPrime",    keywords: ["pinturas prime", "pinturasprime", "800194203", "pinturasprime.com"] },
  { carpeta: "Manutex",          keywords: ["manutex", "comercializadora manutex", "900426666"] },
  { carpeta: "ElGlobo",          keywords: ["el globo", "elglobo", "c.i. el globo", "800227956"] },
  { carpeta: "ServicioCompleto", keywords: ["servicio completo", "serviciocompleto", "900690157"] },
  { carpeta: "ICVO",             keywords: ["icvo", "icvo.com.co", "890932892"] },
  { carpeta: "Produempak",       keywords: ["produempak", "900445797"] },
  { carpeta: "Prointimo",        keywords: ["prointimo", "811042428"] },
  { carpeta: "Termimoda",        keywords: ["termimoda", "900447263"] },
  { carpeta: "Byspro",           keywords: ["byspro", "805018724"] },
  { carpeta: "LaimaSas",         keywords: ["laima sas", "laima s.a.s.", "900461923"] },
];

export interface ClientDetection {
  carpeta: string;
  metodo: 'nit' | 'keyword';
}

/**
 * Detecta el cliente aprobado a partir del texto extraído de un PDF.
 *
 * Paso 1: busca NIT normalizado (quita puntos para matchear "800.069.933" = "800069933").
 * Paso 2: keywords de marca como fallback (solo si no hay NIT).
 *
 * Acepta listas opcionales para usar clientes cargados desde DB en lugar de los hardcodeados.
 */
export function detectClientFromPdf(
  pdfText: string,
  clientNits: Array<{ carpeta: string; nits: string[] }> = CLIENT_NITS,
  clientKeywords: Array<{ carpeta: string; keywords: string[] }> = CLIENT_TEXT_KEYWORDS,
): ClientDetection | null {
  const normalized = pdfText.replace(/\./g, "");
  // Los NIT en CLIENT_NITS son de 9 dígitos (sin dígito de verificación). Se busca
  // el NIT como substring del texto normalizado: así se tolera que el PDF traiga el
  // DV pegado ("8000699330") o con guion ("800069933-0") — solo importan las 9 cifras.
  for (const { carpeta, nits } of clientNits) {
    if (nits.some(nit => normalized.includes(nit))) return { carpeta, metodo: 'nit' };
  }

  const lower = pdfText.toLowerCase();
  for (const { carpeta, keywords } of clientKeywords) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) return { carpeta, metodo: 'keyword' };
  }

  return null;
}

/**
 * Carga las listas de clientes desde la DB para usar en detección dinámica.
 * Retorna las listas hardcodeadas como fallback si la DB no tiene registros.
 */
export function loadClientListsFromDb(db: import("better-sqlite3").Database): {
  nits: Array<{ carpeta: string; nits: string[]; nombre?: string }>;
  keywords: Array<{ carpeta: string; keywords: string[] }>;
} {
  try {
    const rows = db.prepare(
      "SELECT carpeta, nombre, nits_json, keywords_json FROM clientes_aprobados WHERE activo = 1 ORDER BY nombre ASC"
    ).all() as Array<{ carpeta: string; nombre: string; nits_json: string; keywords_json: string }>;
    if (rows.length === 0) return { nits: CLIENT_NITS, keywords: CLIENT_TEXT_KEYWORDS };
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
    return { nits: CLIENT_NITS, keywords: CLIENT_TEXT_KEYWORDS };
  }
}
