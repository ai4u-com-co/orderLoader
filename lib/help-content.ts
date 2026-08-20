import { OrderStatus, type OrderStatusValue } from "./constants";

/**
 * Textos de ayuda contextual para la UI — tono interno (equipo administrativo),
 * no el tono de cliente que usa lib/steps/step6-templates.ts para los emails.
 * Los estados de error reflejan el significado real confirmado en lib/steps/*.ts.
 */
export const ESTADO_HELP: Record<OrderStatusValue, string> = {
  [OrderStatus.NUEVO]: "Pedido detectado, todavía no se empezó a procesar.",
  [OrderStatus.PARSED]: "La IA ya extrajo los datos del PDF a JSON.",
  [OrderStatus.PARSE_VALIDO]: "La extracción pasó las validaciones básicas de formato y campos.",
  [OrderStatus.CATALOG_OK]: "Las referencias del pedido ya se resolvieron contra el catálogo SAP del cliente.",
  [OrderStatus.SAP_NUEVO]: "Nombre anterior de \"Catálogo OK\" — pedidos procesados antes del cambio.",
  [OrderStatus.SAP_MONTADO]: "El pedido ya se subió a SAP como orden de compra.",
  [OrderStatus.VALIDADO]: "Se comparó lo subido a SAP contra el PDF original y coincide.",
  [OrderStatus.NOTIFICANDO]: "Se está por enviar la notificación por correo del resultado.",
  [OrderStatus.NOTIFICADO]: "La notificación por correo ya se envió.",
  [OrderStatus.CERRADO]: "El pedido completó todo el ciclo. No requiere ninguna acción.",
  [OrderStatus.ERROR_PARSE]: "La IA no pudo extraer los datos del PDF. Revisar que el archivo no esté protegido o sea legible.",
  [OrderStatus.ERROR_DUPLICADO]: "Ya existe un pedido con este número de orden de compra en SAP.",
  [OrderStatus.ERROR_CATALOG]: "Uno o más artículos no están homologados en el catálogo SAP del cliente. Hay que registrar la equivalencia en SAP y reintentar.",
  [OrderStatus.ERROR_ITEMS]: "El documento no tiene líneas de artículos válidas. Revisar el PDF original.",
  [OrderStatus.ERROR_SAP]: "SAP rechazó la operación (documento, socio de negocios o artículo con problema, o error de conexión).",
  [OrderStatus.ERROR_VALIDACION]: "Se subió a SAP pero hay diferencias de precio o cantidad contra el PDF. Requiere revisión manual.",
  [OrderStatus.ERROR_REVISION_MANUAL]: "El correo no tenía un PDF de pedido reconocible. Se movió a la carpeta de revisión manual.",
};

export const TRIGGERS_HELP =
  "Quién o qué disparó cada corrida del pipeline: el cron automático, un clic manual en \"Correr Pipeline\", o una llamada externa.";

export const CLIENTE_CARPETA_HELP =
  "Identificador único e interno del cliente en el sistema. Se genera al crearlo y no se puede editar — se usa para nombrar carpetas y archivos internos.";

export const CLIENTE_CARDCODE_HELP =
  "El código de este cliente como socio de negocios en SAP B1. Debe coincidir exactamente con el CardCode real en SAP para que el pedido se pueda subir.";

export const RUN_PIPELINE_WARNING =
  "Vas a correr el pipeline real: se van a descargar los correos nuevos del inbox y subir pedidos a SAP. ¿Continuar?";

export const ERROR_GENERICO_FALLBACK =
  "Ocurrió un error inesperado. Si el problema persiste, avisá al equipo técnico.";

/** Extrae un mensaje legible de un error atrapado; si no hay nada usable, cae al fallback genérico. */
export function friendlyError(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return ERROR_GENERICO_FALLBACK;
}
