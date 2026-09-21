/**
 * FLX-103 (Flexoimpresos / New Stetic): "VALIDAR ARTE" en el Texto libre de la
 * línea del pedido cuando la última Orden de Fabricación de la referencia supera
 * N días. Reglas puras + adaptador al gateway.
 */
import { describe, it, expect, vi } from "vitest";
import type { SapGateway } from "@/lib/sap-gateway";
import {
  VALIDAR_ARTE_TEXTO,
  todayBogota,
  addDays,
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

describe("addDays", () => {
  it("suma días", () => {
    expect(addDays("2026-07-10", 49)).toBe("2026-08-28");
    expect(addDays("2026-11-10", 30)).toBe("2026-12-10");
  });
  it("cruza fin de año y bisiesto sin trampas", () => {
    expect(addDays("2025-12-20", 49)).toBe("2026-02-07");
    expect(addDays("2027-12-31", 60)).toBe("2028-02-29"); // 2028 es bisiesto
  });
});

describe("requiereValidarArte (7 semanas = 49 días — umbral real de New Stetic)", () => {
  it("última OF hace exactamente 49 días → NO (no supera, estrictamente mayor)", () => {
    expect(requiereValidarArte("2026-07-31", 49, "2026-09-18")).toBe(false);
  });
  it("última OF hace 49 días y 1 más → SÍ", () => {
    expect(requiereValidarArte("2026-07-30", 49, "2026-09-18")).toBe(true);
  });
  it("última OF reciente → NO", () => {
    expect(requiereValidarArte("2026-09-10", 49, "2026-09-18")).toBe(false);
  });
  it("referencia sin ninguna OF (nunca fabricada) → SÍ", () => {
    expect(requiereValidarArte(null, 49, "2026-09-18")).toBe(true);
  });
  it("regresión ticket FLX-103 (21-sep-2026): referencia 100591, CloseDate 10-jul-2026, hoy 18-sep-2026 → SÍ (10-jul + 49 días = 28-ago, ya pasó)", () => {
    expect(requiereValidarArte("2026-07-10", 49, "2026-09-18")).toBe(true);
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

  it("marca solo las líneas cuya última OF supera los días; no toca las recientes", async () => {
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
      dias: 49,
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
      dias: 49,
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
      dias: 49,
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
      dias: 49,
      hoy,
      resolverItemCodes: async () => new Map([["CAT-A", "101001"]]),
      obtenerUltimasOF: async () => { throw new Error("Backend GET → 502"); },
    })).rejects.toThrow("502");
  });
});

describe("fetchUltimasOF", () => {
  it("llama al gateway production/last-orders y prefiere closeDate sobre postingDate (FLX-103, 21-sep-2026)", async () => {
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
    expect(map.get("101001")).toBe("2026-04-20"); // closeDate, no postingDate
    expect(map.get("101003")).toBeNull();
    expect(map.has("OTRO")).toBe(false);
  });

  it("OF abierta sin closeDate → cae a postingDate (fallback: mejor eso que perder el dato)", async () => {
    const get = vi.fn(async () => ({
      items: [
        { itemCode: "101002", lastOrder: { docEntry: 2, docNum: 999, status: "Released", postingDate: "2026-09-01", closeDate: null } },
      ],
      asOf: "2026-09-14",
    }));
    const sap = { get, post: vi.fn() } as unknown as SapGateway;

    const map = await fetchUltimasOF(sap, ["101002"]);

    expect(map.get("101002")).toBe("2026-09-01");
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
