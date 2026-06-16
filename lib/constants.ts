/**
 * Estados del ciclo de vida de un pedido en pedidos_maestro.estado.
 *
 * Flujo nominal:
 *   NUEVO → PARSED → PARSE_VALIDO → CATALOG_OK → SAP_MONTADO → VALIDADO
 *         → NOTIFICANDO → NOTIFICADO → CERRADO
 *
 * Cualquier paso puede derivar a un estado ERROR_* (ver ERROR_STATES).
 */
export const OrderStatus = {
  // ── Flujo nominal ──
  NUEVO:                 "NUEVO",
  PARSED:                "PARSED",
  PARSE_VALIDO:          "PARSE_VALIDO",
  CATALOG_OK:            "CATALOG_OK",
  SAP_NUEVO:             "SAP_NUEVO",       // backward-compat (runs previos a CATALOG_OK)
  SAP_MONTADO:           "SAP_MONTADO",
  VALIDADO:              "VALIDADO",
  NOTIFICANDO:           "NOTIFICANDO",     // intención de envío registrada antes del email
  NOTIFICADO:            "NOTIFICADO",
  CERRADO:               "CERRADO",
  // ── Estados de error ──
  ERROR_PARSE:           "ERROR_PARSE",
  ERROR_DUPLICADO:       "ERROR_DUPLICADO",
  ERROR_CATALOG:         "ERROR_CATALOG",
  ERROR_ITEMS:           "ERROR_ITEMS",
  ERROR_SAP:             "ERROR_SAP",
  ERROR_VALIDACION:      "ERROR_VALIDACION",
  ERROR_REVISION_MANUAL: "ERROR_REVISION_MANUAL",  // correo sin PDF/cliente → revisión humana
} as const;

export type OrderStatusValue = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Estados terminales: el pedido completó su ciclo y no necesita más procesamiento. */
export const TERMINAL_STATES: OrderStatusValue[] = [
  OrderStatus.CERRADO,
];

/** Estados de error que pueden generar notificación / alerta. */
export const ERROR_STATES: OrderStatusValue[] = [
  OrderStatus.ERROR_PARSE,
  OrderStatus.ERROR_DUPLICADO,
  OrderStatus.ERROR_CATALOG,
  OrderStatus.ERROR_ITEMS,
  OrderStatus.ERROR_SAP,
  OrderStatus.ERROR_VALIDACION,
  OrderStatus.ERROR_REVISION_MANUAL,
];
