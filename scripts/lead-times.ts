/**
 * Investiga lead times reales vs prometidos para un cliente SAP B1.
 * Soporta dos flujos: Order → DeliveryNote (Exito) y Order → Invoice (Comodin).
 *
 * Uso:
 *   npx tsx scripts/lead-times.ts [cardCode] [desde]
 *   [desde] puede ser una fecha ISO (2025-01-01) o número de meses (6)
 *
 * Ejemplos:
 *   npx tsx scripts/lead-times.ts CN800069933 2025-01-01
 *   npx tsx scripts/lead-times.ts CN890900608 6
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// tsx no carga .env automáticamente — cargarlo antes de getConfig()
try {
  const env = readFileSync(join(process.cwd(), ".env"), "utf8");
  for (const line of env.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
} catch {
  // Sin .env — confiar en variables de entorno del sistema
}

import { getConfig } from "../lib/config";
import { getSapClient, logoutSapClient } from "../lib/sap-client";

const SALES_ORDER_BASE_TYPE = 17;

interface SapOrder {
  DocEntry: number;
  DocNum: number;
  NumAtCard: string;
  CardCode: string;
  CardName: string;
  DocDate: string;
  DocDueDate: string;
}

interface SapDocLine {
  BaseType: number;
  BaseEntry: number;
  Quantity: number;
  ActualDeliveryDate?: string;
}

interface SapDoc {
  DocEntry: number;
  DocDate: string;
  DocumentLines: SapDocLine[];
}

interface LeadTimeRecord {
  OC: string;
  Fecha_Solicitada: string;
  Fecha_Real: string;
  Total_Unidades: number;
  Diferencia_Dias: number;
  // internos
  _docNum: number;
  _cardCode: string;
  _fechaOrden: string;
  _ltPrometido: number;
  _ltReal: number;
  _fuente: string;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function isoDate(dateStr: string): string {
  return dateStr.split("T")[0];
}

function parseFromDate(arg: string): string {
  // Si es fecha ISO (YYYY-MM-DD), usarla directo; si es número, calcular desde hoy
  if (/^\d{4}-\d{2}-\d{2}$/.test(arg)) return arg;
  const months = parseInt(arg, 10);
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split("T")[0];
}

async function fetchAll<T>(
  endpoint: string,
  params: Record<string, string>,
  baseUrl: string
): Promise<T[]> {
  const sap = await getSapClient();
  const results: T[] = [];
  let currentEndpoint = endpoint;
  let currentParams: Record<string, string> | undefined = params;

  while (true) {
    const res = await sap.get<{ value: T[]; "@odata.nextLink"?: string }>(
      currentEndpoint,
      currentParams
    );
    results.push(...(res.value ?? []));
    const next = res["@odata.nextLink"];
    if (!next) break;
    currentEndpoint = next.replace(baseUrl.replace(/\/$/, "") + "/", "");
    currentParams = undefined;
  }

  return results;
}

interface DeliveryInfo {
  date: string;
  source: string;
  totalUnidades: number;
}

// Construye mapa DocEntry(Orden) → { fecha real, unidades totales }
// Si hay múltiples docs (entregas parciales), suma unidades y toma fecha más reciente
function buildDeliveryMap(
  docs: SapDoc[],
  orderMap: Map<number, SapOrder>
): Map<number, DeliveryInfo> {
  const result = new Map<number, DeliveryInfo>();

  for (const doc of docs) {
    for (const line of doc.DocumentLines) {
      if (line.BaseType !== SALES_ORDER_BASE_TYPE) continue;
      if (!orderMap.has(line.BaseEntry)) continue;

      const rawDate = line.ActualDeliveryDate ?? doc.DocDate;
      const source = line.ActualDeliveryDate ? "invoice_actual" : "doc_date";
      const qty = line.Quantity ?? 0;

      const existing = result.get(line.BaseEntry);
      if (!existing) {
        result.set(line.BaseEntry, { date: rawDate, source, totalUnidades: qty });
      } else {
        result.set(line.BaseEntry, {
          date: rawDate > existing.date ? rawDate : existing.date,
          source: rawDate > existing.date ? source : existing.source,
          totalUnidades: existing.totalUnidades + qty,
        });
      }
    }
  }

  return result;
}

function toCsvClean(records: LeadTimeRecord[]): string {
  if (records.length === 0) return "";
  const headers = "OC,Fecha_Solicitada,Fecha_Real,Total_Unidades,Diferencia_Dias";
  const rows = records.map(
    (r) =>
      `${r.OC},${r.Fecha_Solicitada},${r.Fecha_Real},${r.Total_Unidades},${r.Diferencia_Dias}`
  );
  return [headers, ...rows].join("\n");
}

function toCsvFull(records: LeadTimeRecord[]): string {
  if (records.length === 0) return "";
  const headers =
    "OC,sap_doc_num,card_code,Fecha_Orden,Fecha_Solicitada,Fecha_Real,Total_Unidades,Fuente,LT_Prometido_Dias,LT_Real_Dias,Diferencia_Dias";
  const rows = records.map(
    (r) =>
      `${r.OC},${r._docNum},${r._cardCode},${r._fechaOrden},${r.Fecha_Solicitada},${r.Fecha_Real},${r.Total_Unidades},${r._fuente},${r._ltPrometido},${r._ltReal},${r.Diferencia_Dias}`
  );
  return [headers, ...rows].join("\n");
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

async function main() {
  const cardCode = process.argv[2] ?? "CN800069933";
  const desdeArg = process.argv[3] ?? "6";
  const fromDateStr = parseFromDate(desdeArg);

  const config = getConfig();
  const baseUrl = config.sapUrl.replace(/\/$/, "");

  console.log(`=== Investigación de Lead Times ===`);
  console.log(`Cliente:  ${cardCode}`);
  console.log(`Desde:    ${fromDateStr}`);
  console.log(`SAP URL:  ${baseUrl}`);
  console.log("-----------------------------------");

  // 1. Órdenes de venta
  console.log("Descargando órdenes de venta...");
  const orders = await fetchAll<SapOrder>(
    "Orders",
    {
      $filter: `CardCode eq '${cardCode}' and DocDate ge '${fromDateStr}' and Cancelled eq 'tNO'`,
      $select: "DocEntry,DocNum,NumAtCard,CardCode,CardName,DocDate,DocDueDate",
    },
    baseUrl
  );
  console.log(`  → ${orders.length} órdenes`);

  const orderMap = new Map<number, SapOrder>();
  for (const o of orders) orderMap.set(o.DocEntry, o);

  // 2. Delivery Notes (flujo: Order → DeliveryNote, ej. Exito)
  console.log("Descargando notas de entrega...");
  const deliveries = await fetchAll<SapDoc>(
    "DeliveryNotes",
    {
      $filter: `CardCode eq '${cardCode}' and DocDate ge '${fromDateStr}'`,
      $select: "DocEntry,DocDate,DocumentLines",
    },
    baseUrl
  );
  console.log(`  → ${deliveries.length} notas de entrega`);

  // 3. Facturas (flujo: Order → Invoice, ej. Comodin)
  console.log("Descargando facturas...");
  const invoices = await fetchAll<SapDoc>(
    "Invoices",
    {
      $filter: `CardCode eq '${cardCode}' and DocDate ge '${fromDateStr}' and Cancelled eq 'tNO'`,
      $select: "DocEntry,DocDate,DocumentLines",
    },
    baseUrl
  );
  console.log(`  → ${invoices.length} facturas`);

  // 4. Join: prioridad DeliveryNote > Invoice
  const dnMap = buildDeliveryMap(deliveries, orderMap);
  const invMap = buildDeliveryMap(invoices, orderMap);

  const finalMap = new Map<number, DeliveryInfo>();
  for (const [k, v] of invMap) finalMap.set(k, v);
  for (const [k, v] of dnMap) finalMap.set(k, v); // DN sobrescribe si existe

  // 5. Construir registros
  const records: LeadTimeRecord[] = [];
  for (const [docEntry, delivery] of finalMap) {
    const order = orderMap.get(docEntry)!;
    const fechaOrden = new Date(order.DocDate);
    const fechaPrometida = new Date(order.DocDueDate);
    const fechaReal = new Date(delivery.date);

    records.push({
      OC: order.NumAtCard,
      Fecha_Solicitada: isoDate(order.DocDueDate),
      Fecha_Real: isoDate(delivery.date),
      Total_Unidades: delivery.totalUnidades,
      Diferencia_Dias: diffDays(fechaPrometida, fechaReal),
      _docNum: order.DocNum,
      _cardCode: order.CardCode,
      _fechaOrden: isoDate(order.DocDate),
      _ltPrometido: diffDays(fechaOrden, fechaPrometida),
      _ltReal: diffDays(fechaOrden, fechaReal),
      _fuente: delivery.source,
    });
  }

  records.sort((a, b) => a.Fecha_Solicitada.localeCompare(b.Fecha_Solicitada));

  // 6. Guardar CSVs
  const reportsDir = config.pedidosReportsDir;
  mkdirSync(reportsDir, { recursive: true });
  const today = new Date().toISOString().split("T")[0];
  const slug = `${cardCode}-desde-${fromDateStr}`;
  const outPathClean = join(reportsDir, `lead-times-${slug}.csv`);
  const outPathFull = join(reportsDir, `lead-times-${slug}-full.csv`);
  writeFileSync(outPathClean, toCsvClean(records), "utf8");
  writeFileSync(outPathFull, toCsvFull(records), "utf8");

  // 7. Resumen
  const ltReal = records.map((r) => r._ltReal);
  const ltProm = records.map((r) => r._ltPrometido);
  const difs = records.map((r) => r.Diferencia_Dias);
  const tardios = difs.filter((d) => d > 0).length;
  const totalUnidades = records.reduce((s, r) => s + r.Total_Unidades, 0);

  console.log("\n=== RESUMEN ===");
  console.log(`Pedidos con entrega registrada: ${records.length} de ${orders.length}`);
  console.log(`Total unidades entregadas:      ${totalUnidades.toLocaleString()}`);
  if (records.length > 0) {
    console.log(`Lead Time Prometido  — prom: ${avg(ltProm).toFixed(1)} días  |  mín: ${Math.min(...ltProm)}  |  máx: ${Math.max(...ltProm)}`);
    console.log(`Lead Time Real       — prom: ${avg(ltReal).toFixed(1)} días  |  mín: ${Math.min(...ltReal)}  |  máx: ${Math.max(...ltReal)}`);
    console.log(`Diferencia (real-prometido) — prom: ${avg(difs).toFixed(1)} días`);
    console.log(`Entregas tardías (dif > 0):  ${tardios} (${((tardios / records.length) * 100).toFixed(1)}%)`);
  }
  console.log(`\nCSV limpio:   ${outPathClean}`);
  console.log(`CSV completo: ${outPathFull}`);
}

main()
  .catch(console.error)
  .finally(() => logoutSapClient());
