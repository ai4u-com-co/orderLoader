/**
 * Adaptador delgado sobre `runPipeline` (ver pipeline.ts) para implementar
 * el contrato compartido `IAgentAdapter` de `@ai4u/contracts` — mismo patrón
 * ya usado en `cobro-cartera`. Es un wrapper, no una reescritura:
 * `runPipeline` sigue siendo la única fuente de verdad del pipeline real.
 *
 * A diferencia de cobro-cartera (un proceso Vercel sirviendo varios
 * tenants), cada instancia de OrderLoader corre para UN solo tenant — la
 * configuración de cuál (Tamaprint o Flexoimpresos) vive en el `.env` de esa
 * instancia, no en un parámetro de runtime. Por eso `opts.onlyTenant` no se
 * usa acá — el contrato lo permite opcional a propósito, cada agente decide
 * si le aplica.
 */

import type { IAgentAdapter, AgentRunOptions, AgentRunResult } from "@ai4u/contracts"
import { runPipeline } from "./pipeline"

export const AGENT_ID = "orderloader"
export const AGENT_VERSION = "1.0.0"

export const orderLoaderAdapter: IAgentAdapter = {
  id: AGENT_ID,
  version: AGENT_VERSION,

  async run(_opts: AgentRunOptions = {}): Promise<AgentRunResult> {
    const steps = await runPipeline()
    // ok = false si CUALQUIER step tuvo errores — mismo criterio que ya usa
    // logStepResult() en pipeline.ts para decidir log.error vs log.info.
    const ok = steps.every((s) => s.errores === 0)
    return {
      ranAt: new Date().toISOString(),
      ok,
      // La forma real de StepResult[] se preserva tal cual — el contrato no
      // la normaliza (ver doc de IAgentAdapter en @ai4u/contracts).
      summary: { steps } as unknown as Record<string, unknown>,
    }
  },
}
