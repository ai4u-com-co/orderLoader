import { describe, it, expect } from "vitest";
import { SapB1OrderSchema, DocumentLineSchema } from "@/lib/schemas";

// ── DocumentLineSchema ────────────────────────────────────────────────────────

describe("DocumentLineSchema", () => {
  it("acepta línea mínima válida", () => {
    const result = DocumentLineSchema.safeParse({ SupplierCatNum: "X1", Quantity: 5 });
    expect(result.success).toBe(true);
  });

  it("acepta línea con todos los campos", () => {
    const result = DocumentLineSchema.safeParse({
      SupplierCatNum: "PROD-001",
      Quantity: 100,
      UnitPrice: 9999.99,
      DeliveryDate: "20241231",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza SupplierCatNum vacío", () => {
    const result = DocumentLineSchema.safeParse({ SupplierCatNum: "", Quantity: 1 });
    expect(result.success).toBe(false);
  });

  it("rechaza Quantity negativa", () => {
    const result = DocumentLineSchema.safeParse({ SupplierCatNum: "X1", Quantity: -1 });
    expect(result.success).toBe(false);
  });

  it("rechaza DeliveryDate con formato incorrecto", () => {
    const result = DocumentLineSchema.safeParse({
      SupplierCatNum: "X1",
      Quantity: 1,
      DeliveryDate: "2024-12-31",
    });
    expect(result.success).toBe(false);
  });

  it("acepta DeliveryDate opcional ausente", () => {
    const result = DocumentLineSchema.safeParse({ SupplierCatNum: "X1", Quantity: 1 });
    expect(result.success).toBe(true);
  });
});

// ── SapB1OrderSchema ──────────────────────────────────────────────────────────

const ordenValida = {
  DocType: "dDocument_Items" as const,
  NumAtCard: "OC-2024-999",
  CardCode: "CN800069933",
  DocDate: "20240101",
  DocDueDate: "20240131",
  TaxDate: "20240101",
  Comments: "Pedido de prueba",
  DocumentLines: [{ SupplierCatNum: "SKU001", Quantity: 10 }],
};

describe("SapB1OrderSchema", () => {
  it("acepta una orden completa válida", () => {
    expect(SapB1OrderSchema.safeParse(ordenValida).success).toBe(true);
  });

  it("rechaza DocType incorrecto", () => {
    const result = SapB1OrderSchema.safeParse({ ...ordenValida, DocType: "otro" });
    expect(result.success).toBe(false);
  });

  it("rechaza CardCode sin prefijo CN", () => {
    const result = SapB1OrderSchema.safeParse({ ...ordenValida, CardCode: "800069933" });
    expect(result.success).toBe(false);
  });

  it("rechaza DocDate con formato incorrecto", () => {
    const result = SapB1OrderSchema.safeParse({ ...ordenValida, DocDate: "01/01/2024" });
    expect(result.success).toBe(false);
  });

  it("rechaza DocumentLines vacío", () => {
    const result = SapB1OrderSchema.safeParse({ ...ordenValida, DocumentLines: [] });
    expect(result.success).toBe(false);
  });

  it("Comments tiene default vacío si se omite", () => {
    const { Comments: _, ...sinComments } = ordenValida;
    const result = SapB1OrderSchema.safeParse(sinComments);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.Comments).toBe("");
  });

  it("rechaza NumAtCard vacío", () => {
    const result = SapB1OrderSchema.safeParse({ ...ordenValida, NumAtCard: "" });
    expect(result.success).toBe(false);
  });
});
