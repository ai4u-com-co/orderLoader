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

/**
 * Si el tenant tiene configurado un artículo genérico, devuelve la línea sustituta
 * (mismo Quantity/DeliveryDate, SupplierCatNum del genérico, FreeText de aviso con
 * el código original para trazabilidad). Si no hay configuración, devuelve null —
 * el llamador debe tratar la línea como excluida, igual que hoy.
 */
export function resolveUnmatchedLine(config: Config, line: DocumentLine): DocumentLine | null {
  const itemCode = config.genericPlaceholderItemCode;
  if (!itemCode) return null;

  return {
    ...line,
    SupplierCatNum: itemCode,
    FreeText: `Ojo revisar referencia: ${line.SupplierCatNum}`.slice(0, FREE_TEXT_MAX),
  };
}
