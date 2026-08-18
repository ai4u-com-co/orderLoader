/**
 * FLX-059: sustitución de líneas sin match en el catálogo SAP por un artículo
 * genérico "pendiente de revisar", para que el pedido siempre entre completo.
 *
 * Gateado por Config.genericPlaceholderItemCode (env GENERIC_PLACEHOLDER_ITEM_CODE),
 * configurado hoy solo en .env.flexoimpresos. Sin esa variable, resolveUnmatchedLine
 * siempre devuelve null y el llamador debe seguir el comportamiento actual (excluir).
 */

import type { Config } from "./config";
import type { DocumentLine } from "./schemas";

const FREE_TEXT_MAX = 100;

/** Línea sustituida: se sube a SAP por ItemCode directo, no por SupplierCatNum. */
export interface PlaceholderLine extends DocumentLine {
  ItemCode: string;
}

/**
 * Si el tenant tiene configurado un artículo genérico, devuelve la línea sustituta.
 *
 * IMPORTANTE: el ItemCode del genérico va en `ItemCode`, NUNCA en `SupplierCatNum`.
 * SAP resuelve `SupplierCatNum` contra AlternateCatNum (catálogo del cliente) — como
 * el ItemCode del genérico no está registrado ahí para ningún CardCode, mandarlo como
 * SupplierCatNum produce "No matching records found" (ODBC -2028) y el pedido no se
 * monta (bug real detectado en producción FLX-059, ago-2026: 3/3 pedidos fallaron).
 * `SupplierCatNum` se conserva con el código ORIGINAL del pedido — no se usa para
 * subir a SAP (ver step4-upload.ts), solo para trazabilidad/notificación/reconcile.
 */
export function resolveUnmatchedLine(config: Config, line: DocumentLine): PlaceholderLine | null {
  const itemCode = config.genericPlaceholderItemCode;
  if (!itemCode) return null;

  return {
    ...line,
    ItemCode: itemCode,
    FreeText: `Ojo revisar referencia: ${line.SupplierCatNum}`.slice(0, FREE_TEXT_MAX),
  };
}
