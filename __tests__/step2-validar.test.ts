import { describe, it, expect, vi } from "vitest";
import { validarSapB1Json } from "@/lib/steps/step2-validate-parse";
import type { SapB1Order } from "@/lib/steps/step1-parse";

vi.mock("@/lib/config", () => ({
  getConfig: () => ({ cardCodePrefix: "CN" }),
}));

// ── Fixture base válido ───────────────────────────────────────────────────────

function orderValido(overrides: Partial<SapB1Order> = {}): SapB1Order {
  return {
    DocType: "dDocument_Items",
    CardCode: "CN890924167",
    NumAtCard: "OC-2024-001",
    DocDate: "20240315",
    DocDueDate: "20240330",
    TaxDate: "20240315",
    Comments: "",
    DocumentLines: [
      { SupplierCatNum: "PROD001", Quantity: 10, UnitPrice: 5000 },
    ],
    ...overrides,
  };
}

// ── Caso feliz ────────────────────────────────────────────────────────────────

describe("validarSapB1Json — orden válida", () => {
  it("no retorna errores para un pedido correcto", () => {
    expect(validarSapB1Json(orderValido(), "Hermeco")).toEqual([]);
  });

  it("acepta múltiples líneas sin duplicados", () => {
    const order = orderValido({
      DocumentLines: [
        { SupplierCatNum: "A001", Quantity: 1 },
        { SupplierCatNum: "A002", Quantity: 2 },
      ],
    });
    expect(validarSapB1Json(order, "Hermeco")).toEqual([]);
  });
});

// ── DocType ───────────────────────────────────────────────────────────────────

describe("validarSapB1Json — DocType", () => {
  it("rechaza DocType incorrecto", () => {
    const errs = validarSapB1Json(
      orderValido({ DocType: "dDocument_Service" as "dDocument_Items" }),
      "Hermeco"
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/DocType/);
  });
});

// ── CardCode ──────────────────────────────────────────────────────────────────

describe("validarSapB1Json — CardCode", () => {
  it("rechaza CardCode sin prefijo CN", () => {
    const errs = validarSapB1Json(orderValido({ CardCode: "890924167" }), "Hermeco");
    expect(errs.some(e => e.includes("CardCode"))).toBe(true);
  });

  it("rechaza CardCode vacío", () => {
    const errs = validarSapB1Json(orderValido({ CardCode: "" }), "Hermeco");
    expect(errs.some(e => e.includes("CardCode"))).toBe(true);
  });

  it("acepta CardCode con prefijo CN y dígitos", () => {
    expect(validarSapB1Json(orderValido({ CardCode: "CN123456" }), "Hermeco")).toEqual([]);
  });
});

// ── NumAtCard ─────────────────────────────────────────────────────────────────

describe("validarSapB1Json — NumAtCard", () => {
  it("acepta NumAtCard corto (clientes con OCs de numeración baja, ej. '3')", () => {
    expect(validarSapB1Json(orderValido({ NumAtCard: "3" }), "ComestiblesMaxiricos")).toEqual([]);
    expect(validarSapB1Json(orderValido({ NumAtCard: "AB" }), "Hermeco")).toEqual([]);
  });

  it("rechaza NumAtCard vacío", () => {
    const errs = validarSapB1Json(orderValido({ NumAtCard: "" }), "Hermeco");
    expect(errs.some(e => e.includes("NumAtCard"))).toBe(true);
  });

  it("acepta NumAtCard con guiones y puntos", () => {
    expect(validarSapB1Json(orderValido({ NumAtCard: "OC-2024.001/A" }), "Hermeco")).toEqual([]);
  });
});

// ── Fechas ────────────────────────────────────────────────────────────────────

describe("validarSapB1Json — fechas", () => {
  it("rechaza DocDate con formato incorrecto", () => {
    const errs = validarSapB1Json(orderValido({ DocDate: "2024-03-15" }), "Hermeco");
    expect(errs.some(e => e.includes("DocDate"))).toBe(true);
  });

  it("rechaza DocDueDate con fecha imposible", () => {
    const errs = validarSapB1Json(orderValido({ DocDueDate: "20240230" }), "Hermeco");
    expect(errs.some(e => e.includes("DocDueDate"))).toBe(true);
  });

  it("rechaza TaxDate no numérico", () => {
    const errs = validarSapB1Json(orderValido({ TaxDate: "hoy" }), "Hermeco");
    expect(errs.some(e => e.includes("TaxDate"))).toBe(true);
  });
});

// ── DocumentLines ─────────────────────────────────────────────────────────────

describe("validarSapB1Json — DocumentLines", () => {
  it("rechaza lista vacía", () => {
    const errs = validarSapB1Json(orderValido({ DocumentLines: [] }), "Hermeco");
    expect(errs.some(e => e.includes("DocumentLines"))).toBe(true);
  });

  it("rechaza Quantity decimal", () => {
    const errs = validarSapB1Json(
      orderValido({ DocumentLines: [{ SupplierCatNum: "X1", Quantity: 1.5 }] }),
      "Hermeco"
    );
    expect(errs.some(e => e.includes("Quantity"))).toBe(true);
  });

  it("rechaza Quantity cero", () => {
    const errs = validarSapB1Json(
      orderValido({ DocumentLines: [{ SupplierCatNum: "X1", Quantity: 0 }] }),
      "Hermeco"
    );
    expect(errs.some(e => e.includes("Quantity"))).toBe(true);
  });

  it("rechaza Quantity negativo", () => {
    const errs = validarSapB1Json(
      orderValido({ DocumentLines: [{ SupplierCatNum: "X1", Quantity: -5 }] }),
      "Hermeco"
    );
    expect(errs.some(e => e.includes("Quantity"))).toBe(true);
  });

  it("rechaza SupplierCatNum vacío", () => {
    const errs = validarSapB1Json(
      orderValido({ DocumentLines: [{ SupplierCatNum: "  ", Quantity: 1 }] }),
      "Hermeco"
    );
    expect(errs.some(e => e.includes("SupplierCatNum vacío"))).toBe(true);
  });
});

// ── Cero inicial por cliente ───────────────────────────────────────────────────

describe("validarSapB1Json — SupplierCatNum con cero inicial", () => {
  const lineConCero = [{ SupplierCatNum: "0123456", Quantity: 1 }];

  it("rechaza cero inicial para Hermeco", () => {
    const errs = validarSapB1Json(orderValido({ DocumentLines: lineConCero }), "Hermeco");
    expect(errs.some(e => e.includes("cero inicial"))).toBe(true);
  });

  it("rechaza cero inicial para Comodin", () => {
    const errs = validarSapB1Json(orderValido({ DocumentLines: lineConCero }), "Comodin");
    expect(errs.some(e => e.includes("cero inicial"))).toBe(true);
  });

  it("permite cero inicial para EXITO", () => {
    expect(validarSapB1Json(orderValido({ DocumentLines: lineConCero }), "EXITO")).toEqual([]);
  });

  it("permite cero inicial para ELGLOBO", () => {
    expect(validarSapB1Json(orderValido({ DocumentLines: lineConCero }), "ELGLOBO")).toEqual([]);
  });

  it("permite cero inicial para PRODUEMPAK", () => {
    expect(validarSapB1Json(orderValido({ DocumentLines: lineConCero }), "PRODUEMPAK")).toEqual([]);
  });
});

// ── Código de catálogo repetido (FLX-052) ──────────────────────────────────────

describe("validarSapB1Json — SupplierCatNum repetido en el mismo pedido", () => {
  it("rechaza el mismo código dos veces con la misma fecha de entrega de línea", () => {
    const errs = validarSapB1Json(
      orderValido({
        DocumentLines: [
          { SupplierCatNum: "0019062", Quantity: 2700000, UnitPrice: 9.66, DeliveryDate: "20260805" },
          { SupplierCatNum: "0019062", Quantity: 250, UnitPrice: 31399.4, DeliveryDate: "20260805" },
        ],
      }),
      "NewStetic"
    );
    expect(errs.some(e => e.includes("código repetido"))).toBe(true);
  });

  it("rechaza el mismo código dos veces cuando ninguna línea trae fecha propia (caen ambas al DocDueDate general)", () => {
    const errs = validarSapB1Json(
      orderValido({
        DocDueDate: "20260805",
        DocumentLines: [
          { SupplierCatNum: "0019063", Quantity: 2700000, UnitPrice: 9.66 },
          { SupplierCatNum: "0019063", Quantity: 250, UnitPrice: 31399.4 },
        ],
      }),
      "NewStetic"
    );
    expect(errs.some(e => e.includes("código repetido"))).toBe(true);
  });

  it("permite el mismo código repetido cuando las fechas de entrega son distintas (entrega parcial legítima)", () => {
    const errs = validarSapB1Json(
      orderValido({
        DocumentLines: [
          { SupplierCatNum: "A001", Quantity: 100, DeliveryDate: "20260801" },
          { SupplierCatNum: "A001", Quantity: 200, DeliveryDate: "20260901" },
        ],
      }),
      "Hermeco"
    );
    expect(errs).toEqual([]);
  });
});
