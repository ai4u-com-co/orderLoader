/**
 * Regresión — cluster Nightly Error Fixer 2026-09-09 (run_1788897601605, OC 4500325098,
 * cliente Comodin): step1 falló con "Error de validación AI: DocType: Invalid input:
 * expected \"dDocument_Items\"".
 *
 * Causa raíz (lib/schemas.ts:18 + lib/steps/step1-parse.ts): DocType es un valor FIJO que
 * el prompt le pide al modelo devolver siempre igual (lib/prompt-generation.ts:70 — "ALWAYS
 * dDocument_Items — fixed constant"), sin relación con el contenido del PDF. No es un bug
 * del schema (muy estricto) ni del prompt (desalineado con el schema — ambos coinciden en
 * el mismo literal), ni un caso de "el cliente mandó otro tipo de documento": en los 4
 * incidentes reales verificados contra pipeline_log de producción (VM Tamaprint,
 * ago-sep-2026: OC 4500325098, 4500417200, y OC 15192 x3), DocType fue el ÚNICO campo que
 * falló la validación — todo lo demás (NumAtCard, CardCode, fechas, líneas) salió correcto,
 * y en 3 de esos 4 casos el reintento AUTOMÁTICO entre corridas del pipeline (hasta 1h
 * después) devolvió el DocType correcto. Es una alucinación puntual del modelo de visión
 * en un campo que no depende de lo que lee, confirmada NO reproducible con el mismo PDF.
 *
 * El 4to caso (OC 15192, 2026-09-07) agotó los 3 reintentos ENTRE corridas del pipeline
 * (separados hasta 1h) y quedó en ERROR_PARSE pese a ser un pedido 100% válido.
 *
 * Fix: reintentar la MISMA llamada dentro de la misma invocación de parseWithAI (sin
 * gastar un ciclo completo de reintento entre corridas) cuando el ÚNICO issue de Zod es
 * DocType. No afloja la validación: DocType sigue exigiendo el literal exacto en cada
 * intento — solo da más oportunidades inmediatas antes de rendirse.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const streamMock = vi.fn();

function fakeMessage(docType: string) {
  return {
    content: [{ type: "text", text: JSON.stringify({
      DocType: docType,
      NumAtCard: "4500325098",
      CardCode: "CN800069933",
      DocDate: "20260908",
      DocDueDate: "20260924",
      TaxDate: "20260908",
      Comments: "",
      DocumentLines: [{ SupplierCatNum: "123", Quantity: 1, UnitPrice: 100, DeliveryDate: "20260924" }],
    }) }],
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: (...args: unknown[]) => streamMock(...args) };
    static APIError = class extends Error {};
  }
  return { default: FakeAnthropic };
});

vi.mock("@/lib/pdf-vision", () => ({
  pdfToImages: vi.fn().mockResolvedValue({ pages: [Buffer.from("fake-png")], pageCount: 1 }),
  buildVisionContent: vi.fn().mockReturnValue([]),
}));

describe("parseWithAI — reintento inmediato cuando el único error es DocType", () => {
  beforeEach(() => {
    streamMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("reintenta la misma llamada y acepta el pedido si el segundo intento devuelve DocType correcto", async () => {
    // Primer intento: el modelo alucina el DocType (caso real OC 4500325098, 08-sep).
    // Segundo intento: mismo PDF, mismo prompt, DocType correcto — igual que en producción.
    streamMock
      .mockReturnValueOnce({ finalMessage: vi.fn().mockResolvedValue(fakeMessage("dDocument_Service")) })
      .mockReturnValueOnce({ finalMessage: vi.fn().mockResolvedValue(fakeMessage("dDocument_Items")) });

    const { parseWithAI } = await import("@/lib/steps/step1-parse");
    const [order, status] = await parseWithAI(Buffer.from("fake-pdf"), "system prompt");

    expect(streamMock).toHaveBeenCalledTimes(2);
    expect(status).toBe("OK");
    expect(order).not.toBeNull();
    expect(order?.DocType).toBe("dDocument_Items");
    expect(order?.NumAtCard).toBe("4500325098");
  });

  it("se rinde con el mismo mensaje de error de siempre si DocType sigue inválido tras agotar los reintentos", async () => {
    streamMock.mockReturnValue({ finalMessage: vi.fn().mockResolvedValue(fakeMessage("dDocument_Service")) });

    const { parseWithAI } = await import("@/lib/steps/step1-parse");
    const [order, status] = await parseWithAI(Buffer.from("fake-pdf"), "system prompt");

    // 1 intento inicial + 2 reintentos (MAX_DOCTYPE_RETRIES) = 3 llamadas totales.
    expect(streamMock).toHaveBeenCalledTimes(3);
    expect(order).toBeNull();
    expect(status).toMatch(/Error de validación AI: DocType/);
  });

  it("NO reintenta si además de DocType falla otro campo — no es el caso de alucinación puntual", async () => {
    const badMessage = {
      content: [{ type: "text", text: JSON.stringify({
        DocType: "dDocument_Service",
        NumAtCard: "",
        CardCode: "CN800069933",
        DocDate: "20260908",
        DocDueDate: "20260924",
        TaxDate: "20260908",
        Comments: "",
        DocumentLines: [{ SupplierCatNum: "123", Quantity: 1, UnitPrice: 100, DeliveryDate: "20260924" }],
      }) }],
      usage: { input_tokens: 10, output_tokens: 10 },
    };
    streamMock.mockReturnValue({ finalMessage: vi.fn().mockResolvedValue(badMessage) });

    const { parseWithAI } = await import("@/lib/steps/step1-parse");
    const [order, status] = await parseWithAI(Buffer.from("fake-pdf"), "system prompt");

    // Un solo intento: con 2 issues distintos no aplica el retry de DocType.
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(order).toBeNull();
    expect(status).toMatch(/DocType/);
    expect(status).toMatch(/NumAtCard/);
  });
});
