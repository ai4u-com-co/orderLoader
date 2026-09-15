/**
 * FLX-103 (Flexoimpresos / New Stetic): "VALIDAR ARTE" en el Texto libre de la
 * línea del pedido cuando la última Orden de Fabricación de la referencia supera
 * N meses calendario. Reglas puras + adaptador al gateway.
 */
import { describe, it, expect, vi } from "vitest";
import type { SapGateway } from "@/lib/sap-gateway";
import {
  VALIDAR_ARTE_TEXTO,
  todayBogota,
  addCalendarMonths,
  requiereValidarArte,
  aplicarTextoValidarArte,
  aplicarValidarArte,
  fetchUltimasOF,
} from "@/lib/validar-arte";

describe("todayBogota", () => {
  it("usa la fecha de Colombia, no UTC (22:00 COL = 03:00 UTC del día siguiente)", () => {
    expect(todayBogota(new Date("2026-09-15T03:00:00Z"))).toBe("2026-09-14");
    expect(todayBogota(new Date("2026-09-15T05:00:00Z"))).toBe("2026-09-15");
  });
});

describe("addCalendarMonths", () => {
  it("suma meses calendario", () => {
    expect(addCalendarMonths("2026-04-18", 2)).toBe("2026-06-18");
    expect(addCalendarMonths("2026-11-10", 2)).toBe("2027-01-10");
  });
  it("ajusta al último día del mes cuando el día no existe", () => {
    expect(addCalendarMonths("2025-12-31", 2)).toBe("2026-02-28");
    expect(addCalendarMonths("2027-12-31", 2)).toBe("2028-02-29");
  });
});

describe("requiereValidarArte (2 meses)", () => {
  it("última OF hace exactamente 2 meses → NO (no supera)", () => {
    expect(requiereValidarArte("2026-07-14", 2, "2026-09-14")).toBe(false);
  });
  it("última OF hace 2 meses y 1 día → SÍ", () => {
    expect(requiereValidarArte("2026-07-13", 2, "2026-09-14")).toBe(true);
  });
  it("última OF reciente → NO", () => {
    expect(requiereValidarArte("2026-08-30", 2, "2026-09-14")).toBe(false);
  });
  it("referencia sin ninguna OF (nunca fabricada) → SÍ", () => {
    expect(requiereValidarArte(null, 2, "2026-09-14")).toBe(true);
  });
  it("fin de mes: 31-dic + 2 meses = 28-feb; el 1-mar ya supera", () => {
    expect(requiereValidarArte("2025-12-31", 2, "2026-02-28")).toBe(false);
    expect(requiereValidarArte("2025-12-31", 2, "2026-03-01")).toBe(true);
  });
});

describe("aplicarTextoValidarArte", () => {
  it("línea sin texto → 'VALIDAR ARTE'", () => {
    expect(aplicarTextoValidarArte("")).toBe(VALIDAR_ARTE_TEXTO);
    expect(aplicarTextoValidarArte(undefined)).toBe(VALIDAR_ARTE_TEXTO);
  });
  it("línea con texto → concatena sin pisar, el aviso primero", () => {
    expect(aplicarTextoValidarArte("Tienda 45")).toBe("VALIDAR ARTE - Tienda 45");
  });
  it("idempotente: no duplica si ya lo tiene", () => {
    expect(aplicarTextoValidarArte("VALIDAR ARTE - Tienda 45")).toBe("VALIDAR ARTE - Tienda 45");
  });
  it("respeta el máximo de 100 caracteres de FreeText sin perder el aviso", () => {
    const out = aplicarTextoValidarArte("x".repeat(150));
    expect(out.length).toBe(100);
    expect(out.startsWith(VALIDAR_ARTE_TEXTO)).toBe(true);
  });
});

describe("aplicarValidarArte", () => {
  const hoy = "2026-09-14";

  it("marca solo las líneas cuya última OF supera los meses; no toca las recientes", async () => {
    const resolverItemCodes = vi.fn(async () => new Map([["CAT-VIEJA", "101001"], ["CAT-NUEVA", "101002"], ["CAT-NUNCA", "101003"]]));
    const obtenerUltimasOF = vi.fn(async () => new Map<string, string | null>([
      ["101001", "2026-04-18"],
      ["101002", "2026-09-01"],
      ["101003", null],
    ]));

    const r = await aplicarValidarArte({
      lines: [
        { SupplierCatNum: "CAT-VIEJA", FreeText: "Tienda 1", Quantity: 1 },
        { SupplierCatNum: "CAT-NUEVA", FreeText: "", Quantity: 2 },
        { SupplierCatNum: "CAT-NUNCA", Quantity: 3 },
      ],
      meses: 2,
      hoy,
      resolverItemCodes,
      obtenerUltimasOF,
    });

    expect(r.lines.map(l => l.FreeText)).toEqual(["VALIDAR ARTE - Tienda 1", "", VALIDAR_ARTE_TEXTO]);
    expect(r.lines[0].Quantity).toBe(1);
    expect(r.marcadas).toEqual(["CAT-VIEJA", "CAT-NUNCA"]);
    expect(obtenerUltimasOF).toHaveBeenCalledWith(["101001", "101002", "101003"]);
  });

  it("no marca líneas placeholder (ItemCode genérico FLX-059) ni referencias que no se pudieron resolver", async () => {
    const resolverItemCodes = vi.fn(async () => new Map([["CAT-OK", "101001"]]));
    const obtenerUltimasOF = vi.fn(async () => new Map<string, string | null>([["101001", "2026-09-10"]]));

    const r = await aplicarValidarArte({
      lines: [
        { SupplierCatNum: "CAT-GEN", ItemCode: "102296", FreeText: "Ojo revisar referencia: CAT-GEN" },
        { SupplierCatNum: "CAT-SIN-MAPEO", FreeText: "" },
        { SupplierCatNum: "CAT-OK", FreeText: "" },
      ],
      meses: 2,
      hoy,
      resolverItemCodes,
      obtenerUltimasOF,
    });

    expect(resolverItemCodes).toHaveBeenCalledWith(["CAT-SIN-MAPEO", "CAT-OK"]);
    expect(r.lines.map(l => l.FreeText)).toEqual(["Ojo revisar referencia: CAT-GEN", "", ""]);
    expect(r.marcadas).toEqual([]);
  });

  it("si el gateway no devuelve un ItemCode pedido, no lo marca (desconocido ≠ nunca fabricado)", async () => {
    const r = await aplicarValidarArte({
      lines: [{ SupplierCatNum: "CAT-A", FreeText: "" }],
      meses: 2,
      hoy,
      resolverItemCodes: async () => new Map([["CAT-A", "101001"]]),
      obtenerUltimasOF: async () => new Map(),
    });
    expect(r.marcadas).toEqual([]);
    expect(r.lines[0].FreeText).toBe("");
  });

  it("propaga el error de la consulta (el llamador decide fail-open)", async () => {
    await expect(aplicarValidarArte({
      lines: [{ SupplierCatNum: "CAT-A", FreeText: "" }],
      meses: 2,
      hoy,
      resolverItemCodes: async () => new Map([["CAT-A", "101001"]]),
      obtenerUltimasOF: async () => { throw new Error("Backend GET → 502"); },
    })).rejects.toThrow("502");
  });
});

describe("fetchUltimasOF", () => {
  it("llama al gateway production/last-orders y mapea itemCode → postingDate (null si nunca)", async () => {
    const get = vi.fn(async () => ({
      items: [
        { itemCode: "101001", lastOrder: { docEntry: 1, docNum: 211, status: "Closed", postingDate: "2026-04-18", closeDate: "2026-04-20" } },
        { itemCode: "101003", lastOrder: null },
      ],
      asOf: "2026-09-14",
    }));
    const sap = { get, post: vi.fn() } as unknown as SapGateway;

    const map = await fetchUltimasOF(sap, ["101001", "101003"]);

    expect(get).toHaveBeenCalledWith("LastProductionOrders", { itemCodes: "101001,101003" });
    expect(map.get("101001")).toBe("2026-04-18");
    expect(map.get("101003")).toBeNull();
    expect(map.has("OTRO")).toBe(false);
  });

  it("respuesta con forma inesperada → lanza (no asume 'nunca fabricado')", async () => {
    const sap = { get: vi.fn(async () => ({ error: "x" })), post: vi.fn() } as unknown as SapGateway;
    await expect(fetchUltimasOF(sap, ["101001"])).rejects.toThrow(/inesperada/);
  });

  it("lista vacía → no llama al gateway", async () => {
    const sap = { get: vi.fn(), post: vi.fn() };
    const map = await fetchUltimasOF(sap, []);
    expect(map.size).toBe(0);
    expect(sap.get).not.toHaveBeenCalled();
  });
});
