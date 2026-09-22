/**
 * Regresión — auditoría de observabilidad (sep-2026): orderloader-tamaprint/
 * orderloader-flexoimpresos dejaban `tenant_id` en null el 100% de las veces en
 * platform_logs, pese a que el tenant activo (config.tenant) está disponible desde
 * que arranca el pipeline. Causa raíz: pipeline.ts:375 solo pasaba `pipeline_run_id`
 * a setRunContext(), nunca el tenant.
 *
 * El panel admin filtra por `tenant_id` (columna dedicada, normalizada contra
 * tenants.id — ver mission-control-admin app/api/ingest/logs/route.ts) — sin este
 * campo, orderLoader solo era identificable por el nombre del `service`, debilitando
 * tanto el filtrado del panel como el clustering del Nightly Error Fixer.
 *
 * Fix: pipeline.ts:375 ahora pasa `tenant: getConfig().tenant` a setRunContext().
 * Este test corre runPipeline() de verdad (con los steps/DB/mailer mockeados, mismo
 * patrón que pipeline-alert-consecutive.test.ts) y confirma que un log emitido DURANTE
 * la corrida (vía el step1 mockeado, que loguea con el logger real de lib/logger)
 * efectivamente incluye `tenant` en sus fields.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import type Database from "better-sqlite3";

let _db: Database.Database;

const calls: Array<{ fields: Record<string, unknown>; msg: string }> = [];
vi.mock("@ai4u/platform/logger", () => ({
  getLogger: (_name: string) => ({
    debug: vi.fn(),
    info: (fields: Record<string, unknown>, msg: string) => calls.push({ fields, msg }),
    warn: vi.fn(),
    error: (fields: Record<string, unknown>, msg: string) => calls.push({ fields, msg }),
  }),
}));

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getDb: () => _db, backupDb: vi.fn(), migrate: vi.fn() };
});
vi.mock("@/lib/mailer", () => ({ sendAlertEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sap-gateway", () => ({ getActiveSap: vi.fn(), clearActiveSap: vi.fn() }));
vi.mock("@/lib/config", () => ({
  getConfig: () => ({ tenantDisplayName: "Tamaprint", tenant: "tamaprint" }),
}));

const emptyResult = { procesados: 0, errores: 0, saltados: 0, detalles: [] };
vi.mock("@/lib/steps/step0-download", () => ({
  run: vi.fn().mockResolvedValue(emptyResult),
  recoverPendingMoves: vi.fn().mockResolvedValue([]),
}));
// step1 loguea con el logger real (a través de lib/logger, que respeta el runContext) para
// probar que el tenant efectivamente viaja hasta un log emitido durante la corrida.
vi.mock("@/lib/steps/step1-parse", async () => {
  const { getLogger } = await import("@/lib/logger");
  return {
    run: vi.fn(async () => {
      getLogger("step1-parse").info("paso de prueba dentro de la corrida");
      return emptyResult;
    }),
  };
});
vi.mock("@/lib/steps/step2-validate-parse", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));
vi.mock("@/lib/steps/step3-sap-query", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));
vi.mock("@/lib/steps/step4-upload", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));
vi.mock("@/lib/steps/step5-reconcile", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));
vi.mock("@/lib/steps/step6-notify", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));
vi.mock("@/lib/steps/step7-archive", () => ({ run: vi.fn().mockResolvedValue(emptyResult) }));

describe("runPipeline() — el tenant activo viaja en el runContext de cada corrida", () => {
  beforeEach(() => {
    _db = createTestDb();
    calls.length = 0;
  });
  afterEach(() => { _db.close(); });

  it("los logs emitidos durante la corrida incluyen tenant y pipeline_run_id", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    await runPipeline({});

    const stepLog = calls.find(c => c.msg === "paso de prueba dentro de la corrida");
    expect(stepLog).toBeDefined();
    expect(stepLog?.fields.tenant).toBe("tamaprint");
    expect(stepLog?.fields.pipeline_run_id).toMatch(/^run_/);
  });
});
