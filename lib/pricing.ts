/**
 * Precios de los modelos Anthropic usados por OrderLoader (USD por 1M tokens).
 * Fuente única de verdad — usada tanto en el pipeline (step1) como en el
 * script de cálculo de costos (scripts/calculate-costs.ts).
 */
export const PRICING: Record<string, { inputPer1M: number; outputPer1M: number; label: string }> = {
  "claude-sonnet-4-6":         { inputPer1M: 3.00, outputPer1M: 15.00, label: "Sonnet 4.6 (extracción PDF)" },
  "claude-haiku-4-5-20251001": { inputPer1M: 0.80, outputPer1M: 4.00,  label: "Haiku 4.5 (triage adjuntos)" },
};

/** Precio por defecto cuando el modelo no está en la tabla (asume Sonnet, el más caro). */
export const DEFAULT_PRICING = { inputPer1M: 3.0, outputPer1M: 15.0 };

/** Estima el costo en USD de una llamada dado el modelo y los tokens consumidos. */
export function estimateCostUsd(model: string, inputTokens = 0, outputTokens = 0): number {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return (inputTokens / 1_000_000) * p.inputPer1M + (outputTokens / 1_000_000) * p.outputPer1M;
}
