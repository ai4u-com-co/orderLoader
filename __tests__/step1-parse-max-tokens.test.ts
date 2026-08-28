/**
 * Regresión — incidente Éxito 2026-08-25 (OC 4501537324/4501537326): pedidos grandes
 * (multi-tienda, 1 línea por "Dependencia de Entrega" — ver OC 4501537326, 51 páginas /
 * ~400 líneas) truncaban la respuesta de Claude ANTES de completar el JSON. En 3
 * intentos distintos, el mismo pedido falló con "Unterminated string in JSON",
 * "Expected double-quoted property name in JSON" y "Unexpected end of JSON input" —
 * los tres son síntomas de una respuesta cortada por max_tokens, no de comillas o
 * saltos de línea sin escapar (step1-parse.ts ya usa JSON.parse(), nunca concatena el
 * payload a mano).
 *
 * Verificado contra pipeline_log real de la VM de producción (Tamaprint): las 3
 * corridas de la misma OC 4501537326 fallaron con esos 3 errores distintos, y el
 * .pdf real (51 páginas, ~400 "Pos") sustenta que el output JSON completo excede el
 * límite viejo de 16384 tokens.
 *
 * Este test fija el max_tokens real pasado a la API de Anthropic para que nadie lo
 * vuelva a bajar sin darse cuenta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const streamMock = vi.fn();

const FAKE_FINAL_MESSAGE = {
  content: [{ type: "text", text: JSON.stringify({
    DocType: "dDocument_Items",
    NumAtCard: "OC-1",
    CardCode: "CN890900608",
    DocDate: "20260101",
    DocDueDate: "20260115",
    TaxDate: "20260101",
    Comments: "",
    DocumentLines: [{ SupplierCatNum: "123", Quantity: 1, UnitPrice: 100, DeliveryDate: "20260115" }],
  }) }],
  usage: { input_tokens: 10, output_tokens: 10 },
};

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

describe("parseWithAI — max_tokens", () => {
  beforeEach(() => {
    streamMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    streamMock.mockReturnValue({
      finalMessage: vi.fn().mockResolvedValue(FAKE_FINAL_MESSAGE),
    });
  });

  it("pide un max_tokens suficiente para pedidos multi-tienda grandes (>= 32768, no 16384)", async () => {
    const { parseWithAI } = await import("@/lib/steps/step1-parse");
    await parseWithAI(Buffer.from("fake-pdf"), "system prompt");

    expect(streamMock).toHaveBeenCalledTimes(1);
    const callArgs = streamMock.mock.calls[0][0] as { max_tokens: number };
    // El caso real (Éxito, 400 líneas) necesitó más que el límite viejo de 16384.
    // 32768 es el umbral de regresión; el fix actual pide 65536.
    expect(callArgs.max_tokens).toBeGreaterThanOrEqual(32768);
  });

  it("usa .stream() en vez de .create() — con max_tokens:65536 el SDK rechaza .create() no-streaming (ver ERROR_PARSE, OC 460164890027081, 28-ago)", async () => {
    const { parseWithAI } = await import("@/lib/steps/step1-parse");
    const [order] = await parseWithAI(Buffer.from("fake-pdf"), "system prompt");

    expect(order).not.toBeNull();
  });
});
