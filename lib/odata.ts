/**
 * Utilidades para construir filtros OData seguros contra SAP B1 Service Layer.
 *
 * Las OC (NumAtCard) y otros valores provienen de PDFs extraídos por IA y pueden
 * contener comillas simples. Interpolarlos sin escapar rompe la query OData
 * (`NumAtCard eq 'O'BRIEN'`) y puede causar falsos negativos en la detección de
 * duplicados — subiendo una orden ya existente a SAP por segunda vez.
 *
 * En OData v4 una comilla simple dentro de un literal string se escapa
 * duplicándola: `O'Brien` → `'O''Brien'`.
 */

/** Escapa un valor para usarlo dentro de un literal string OData (entre comillas simples). */
export function odataEscape(value: string): string {
  return String(value ?? "").replace(/'/g, "''");
}

/** Construye un literal string OData ya entrecomillado y escapado: `O'Brien` → `'O''Brien'`. */
export function odataString(value: string): string {
  return `'${odataEscape(value)}'`;
}
