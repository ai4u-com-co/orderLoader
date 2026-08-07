import { describe, it, expect, vi } from "vitest"
import type { StepResult } from "@/lib/pipeline"

const runPipelineMock = vi.fn()
vi.mock("@/lib/pipeline", () => ({
  runPipeline: (...args: unknown[]) => runPipelineMock(...args),
}))

function fakeStep(overrides: Partial<StepResult> = {}): StepResult {
  return {
    step: 0,
    name: "download",
    procesados: 1,
    errores: 0,
    saltados: 0,
    detalles: [],
    duracionMs: 10,
    ...overrides,
  }
}

describe("orderLoaderAdapter", () => {
  it("id y version son estables", async () => {
    const { orderLoaderAdapter, AGENT_ID, AGENT_VERSION } = await import("@/lib/agent-adapter")
    expect(orderLoaderAdapter.id).toBe(AGENT_ID)
    expect(orderLoaderAdapter.version).toBe(AGENT_VERSION)
  })

  it("ok=true cuando ningún step tuvo errores", async () => {
    runPipelineMock.mockResolvedValueOnce([fakeStep({ step: 0 }), fakeStep({ step: 1 })])

    const { orderLoaderAdapter } = await import("@/lib/agent-adapter")
    const result = await orderLoaderAdapter.run()

    expect(result.ok).toBe(true)
    expect(result.summary).toEqual({ steps: [fakeStep({ step: 0 }), fakeStep({ step: 1 })] })
  })

  it("ok=false si CUALQUIER step tuvo errores", async () => {
    runPipelineMock.mockResolvedValueOnce([fakeStep({ step: 0, errores: 0 }), fakeStep({ step: 3, errores: 2 })])

    const { orderLoaderAdapter } = await import("@/lib/agent-adapter")
    const result = await orderLoaderAdapter.run()

    expect(result.ok).toBe(false)
  })

  it("no le pasa nada raro a runPipeline (sin argumentos)", async () => {
    runPipelineMock.mockResolvedValueOnce([])

    const { orderLoaderAdapter } = await import("@/lib/agent-adapter")
    await orderLoaderAdapter.run({ onlyTenant: "tamaprint" })

    expect(runPipelineMock).toHaveBeenCalledWith()
  })
})
