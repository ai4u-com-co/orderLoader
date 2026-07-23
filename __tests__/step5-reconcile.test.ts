import { describe, it, expect } from "vitest";
import { pairPdfAndSapLines } from "@/lib/steps/step5-reconcile";
import type { DocumentLine } from "@/lib/schemas";

function pdfLine(overrides: Partial<DocumentLine> = {}): DocumentLine {
  return { SupplierCatNum: "A001", Quantity: 10, ...overrides };
}

const DOC_DUE_DATE = "20260805";

describe("pairPdfAndSapLines — caso simple", () => {
  it("empareja una línea PDF con la única línea SAP del mismo código", () => {
    const pares = pairPdfAndSapLines(
      [pdfLine({ SupplierCatNum: "A001" })],
      [{ SupplierCatNum: "A001", Quantity: 10 }],
      DOC_DUE_DATE
    );
    expect(pares).toHaveLength(1);
    expect(pares[0].sapLine).not.toBeNull();
    expect(pares[0].sapLine?.SupplierCatNum).toBe("A001");
  });

  it("reporta sapLine=null cuando el código no existe en SAP", () => {
    const pares = pairPdfAndSapLines(
      [pdfLine({ SupplierCatNum: "A001" })],
      [{ SupplierCatNum: "B002", Quantity: 10 }],
      DOC_DUE_DATE
    );
    expect(pares[0].sapLine).toBeNull();
  });

  it("matchea sin ceros iniciales cuando SAP guarda el código sin ceros", () => {
    const pares = pairPdfAndSapLines(
      [pdfLine({ SupplierCatNum: "0021446" })],
      [{ SupplierCatNum: "21446", Quantity: 10 }],
      DOC_DUE_DATE
    );
    expect(pares[0].sapLine?.SupplierCatNum).toBe("21446");
  });
});

// ── Regresión FLX-052: código repetido, mismo emparejamiento espurio de Array.find ──

describe("pairPdfAndSapLines — código repetido (regresión FLX-052)", () => {
  it("empareja cada línea PDF con la línea SAP de la misma fecha, no siempre la primera", () => {
    // Entrega parcial legítima: mismo código, dos fechas de entrega distintas.
    const pdfLines = [
      pdfLine({ SupplierCatNum: "0019062", Quantity: 2700000, DeliveryDate: "20260801" }),
      pdfLine({ SupplierCatNum: "0019062", Quantity: 250, DeliveryDate: "20260901" }),
    ];
    const sapLines = [
      { SupplierCatNum: "0019062", Quantity: 2700000, ShipDate: "2026-08-01" },
      { SupplierCatNum: "0019062", Quantity: 250, ShipDate: "2026-09-01" },
    ];

    const pares = pairPdfAndSapLines(pdfLines, sapLines, DOC_DUE_DATE);

    expect(pares[0].sapLine?.ShipDate).toBe("2026-08-01");
    expect(pares[0].sapLine?.Quantity).toBe(2700000);
    expect(pares[1].sapLine?.ShipDate).toBe("2026-09-01");
    expect(pares[1].sapLine?.Quantity).toBe(250);
  });

  it("nunca reutiliza la misma línea SAP para dos líneas PDF distintas", () => {
    const pdfLines = [
      pdfLine({ SupplierCatNum: "0019063", Quantity: 100, DeliveryDate: "20260801" }),
      pdfLine({ SupplierCatNum: "0019063", Quantity: 200, DeliveryDate: "20260901" }),
    ];
    // Solo hay UNA línea SAP con ese código — la segunda línea PDF debe quedar sin match,
    // no robarle la línea SAP a la primera.
    const sapLines = [
      { SupplierCatNum: "0019063", Quantity: 100, ShipDate: "2026-08-01" },
    ];

    const pares = pairPdfAndSapLines(pdfLines, sapLines, DOC_DUE_DATE);

    expect(pares[0].sapLine).not.toBeNull();
    expect(pares[1].sapLine).toBeNull();
  });

  it("sin fecha exacta disponible, cae a cualquier línea SAP libre del mismo código", () => {
    const pdfLines = [pdfLine({ SupplierCatNum: "0019063", DeliveryDate: "20260101" })];
    const sapLines = [{ SupplierCatNum: "0019063", Quantity: 10, ShipDate: "2026-08-01" }];

    const pares = pairPdfAndSapLines(pdfLines, sapLines, DOC_DUE_DATE);

    expect(pares[0].sapLine?.SupplierCatNum).toBe("0019063");
  });

  it("usa DocDueDate como fecha efectiva cuando la línea no trae DeliveryDate propio", () => {
    const pdfLines = [pdfLine({ SupplierCatNum: "A001" })]; // sin DeliveryDate
    const sapLines = [
      { SupplierCatNum: "A001", Quantity: 1, ShipDate: "2026-01-01" },
      { SupplierCatNum: "A001", Quantity: 2, ShipDate: "2026-08-05" }, // == DOC_DUE_DATE
    ];

    const pares = pairPdfAndSapLines(pdfLines, sapLines, DOC_DUE_DATE);

    expect(pares[0].sapLine?.ShipDate).toBe("2026-08-05");
  });
});
