/**
 * FLX-103: aviso "VALIDAR ARTE" en el Texto libre (DocumentLines.FreeText =
 * RDR1.FreeTxt) de las líneas del pedido de venta cuya referencia no se fabrica
 * hace más de N días.
 *
 * Gateado POR CLIENTE (clientes_aprobados.validar_arte_dias, editable en
 * /clientes/[id]) — nunca por tenant ni por un CardCode literal en código. Sin
 * la config el pedido se sube exactamente igual que antes.
 *
 * Fuente de "última OF": gateway sap-b1-backend GET production/last-orders
 * (OWOR no cancelada más reciente por PostDate). Se mide contra CloseDate de
 * esa OF — el cliente pidió medir por la fecha de cierre, no de creación
 * (ajuste 21-sep-2026, FLX-103). Si la OF sigue abierta y no tiene CloseDate,
 * se usa PostDate como fallback (mejor no medir con precisión que perder el
 * dato). Un artículo sin ninguna OF se trata como "requiere validar arte"
 * (referencia sin historial de fabricación).
 *
 * Todo lo de acá lanza ante error; step4 decide fail-open (sube el pedido sin
 * el aviso y deja un WARN en pipeline_log).
 */

import type { SapGateway } from "./sap-gateway";

export const VALIDAR_ARTE_TEXTO = "VALIDAR ARTE";

/** SAP B1 DocumentLine.FreeText max = 100 chars (ver step4-upload.ts). */
const FREE_TEXT_MAX = 100;

/**
 * Fecha de hoy en Colombia "YYYY-MM-DD". NUNCA toISOString(): después de las
 * 19:00 hora Colombia UTC ya es el día siguiente.
 */
export function todayBogota(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Suma `dias` días a "YYYY-MM-DD". Aritmética simple de días (sin componente
 * horario, sin trampas de zona horaria: son strings de fecha calendario, igual
 * que todayBogota() de acá arriba).
 */
export function addDays(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const utcMs = Date.UTC(y, m - 1, d) + dias * 24 * 60 * 60 * 1000;
  const dt = new Date(utcMs);
  const ny = dt.getUTCFullYear();
  const nm = dt.getUTCMonth() + 1;
  const nd = dt.getUTCDate();
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/**
 * true si la última OF "supera" `dias` días a la fecha `hoy`
 * (estrictamente: exactamente N días todavía NO supera), o si nunca hubo OF.
 */
export function requiereValidarArte(ultimaOF: string | null, dias: number, hoy: string): boolean {
  if (!ultimaOF) return true;
  return addDays(ultimaOF, dias) < hoy;
}

/** Antepone el aviso al texto libre existente (sin pisarlo), idempotente, dentro de 100 chars. */
export function aplicarTextoValidarArte(freeText: string | undefined): string {
  const actual = (freeText ?? "").trim();
  if (actual.toUpperCase().includes(VALIDAR_ARTE_TEXTO)) return freeText ?? "";
  const nuevo = actual ? `${VALIDAR_ARTE_TEXTO} - ${actual}` : VALIDAR_ARTE_TEXTO;
  return nuevo.slice(0, FREE_TEXT_MAX);
}

export interface LineaValidable {
  SupplierCatNum: string;
  FreeText?: string;
  /** Presente solo en líneas placeholder (artículo genérico FLX-059) */
  ItemCode?: string;
}

export interface AplicarValidarArteParams<L extends LineaValidable> {
  lines: L[];
  dias: number;
  /** "YYYY-MM-DD" en America/Bogota */
  hoy: string;
  /** SupplierCatNum → ItemCode SAP (los no resueltos simplemente no vienen en el Map) */
  resolverItemCodes: (catNums: string[]) => Promise<Map<string, string>>;
  /** ItemCode → fecha última OF ("YYYY-MM-DD") | null si nunca se fabricó */
  obtenerUltimasOF: (itemCodes: string[]) => Promise<Map<string, string | null>>;
}

export async function aplicarValidarArte<L extends LineaValidable>(
  params: AplicarValidarArteParams<L>,
): Promise<{ lines: L[]; marcadas: string[] }> {
  const { lines, dias, hoy, resolverItemCodes, obtenerUltimasOF } = params;

  // Las líneas placeholder van con un artículo genérico: no hay arte que validar.
  const catNums = [...new Set(lines.filter(l => !l.ItemCode).map(l => l.SupplierCatNum))];
  if (catNums.length === 0) return { lines: lines.map(l => ({ ...l })), marcadas: [] };

  const itemCodeByCat = await resolverItemCodes(catNums);
  const itemCodes = [
    ...new Set(catNums.map(c => itemCodeByCat.get(c)).filter((c): c is string => Boolean(c))),
  ];
  if (itemCodes.length === 0) return { lines: lines.map(l => ({ ...l })), marcadas: [] };

  const ultimaOF = await obtenerUltimasOF(itemCodes);

  const marcadas: string[] = [];
  const out = lines.map(l => {
    if (l.ItemCode) return { ...l };
    const itemCode = itemCodeByCat.get(l.SupplierCatNum);
    // Sin ItemCode resuelto o sin respuesta del gateway para ese artículo:
    // desconocido ≠ "nunca fabricado" → no se marca.
    if (!itemCode || !ultimaOF.has(itemCode)) return { ...l };
    if (!requiereValidarArte(ultimaOF.get(itemCode) ?? null, dias, hoy)) return { ...l };
    if (!marcadas.includes(l.SupplierCatNum)) marcadas.push(l.SupplierCatNum);
    return { ...l, FreeText: aplicarTextoValidarArte(l.FreeText) };
  });

  return { lines: out, marcadas };
}

interface LastOrdersResponse {
  items: Array<{
    itemCode: string;
    lastOrder: { postingDate: string | null; closeDate: string | null } | null;
  }>;
}

/** GET {gateway}/api/v1/{tenant}/production/last-orders?itemCodes=A,B */
export async function fetchUltimasOF(
  sap: SapGateway,
  itemCodes: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (itemCodes.length === 0) return map;

  const res = await sap.get<unknown>("LastProductionOrders", { itemCodes: itemCodes.join(",") });
  const items = (res as Partial<LastOrdersResponse> | null)?.items;
  if (!Array.isArray(items)) {
    throw new Error("Respuesta inesperada de production/last-orders (sin items[])");
  }
  for (const it of items) {
    if (!it || typeof it.itemCode !== "string") continue;
    // CloseDate (fecha de cierre real de la OF) primero; si la OF sigue
    // abierta y no tiene CloseDate, PostDate como fallback (FLX-103, 21-sep).
    map.set(it.itemCode, it.lastOrder?.closeDate ?? it.lastOrder?.postingDate ?? null);
  }
  return map;
}
