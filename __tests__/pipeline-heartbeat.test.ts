/**
 * Verifica que runPipeline escribe un registro 'heartbeat' en pipeline_log al terminar,
 * SIN importar si hubo correos nuevos. checkMissedCron() y /api/health miden la salud
 * del cron contra ese heartbeat, no contra 'download' (que solo se escribe al procesar
 * un correo) — esto evita falsos "cron perdido" en períodos sin pedidos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import type Database from "better-sqlite3";

let _db: Database.Database;

// DB: getDb apunta a la test db; backupDb/migrate no-op; logPipeline queda REAL
// (del módulo original) para que el heartbeat se escriba de verdad en _db.
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getDb: () => _db, backupDb: vi.fn(), migrate: vi.fn() };
});
vi.mock("@/lib/mailer", () => ({ sendAlertEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sap-client", () => ({
  logoutSapClient: vi.fn().mockResolvedValue(undefined),
  clearSapClient: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  getConfig: () => ({ tenantDisplayName: "Test", tenant: "test" }),
}));

// Todos los steps mockeados sin actividad. download con procesados:0 corta el loop
// tras la primera iteración.
// download con procesados:0 corta el loop tras la primera iteración; el resto, vacíos.
vi.mock("@/lib/steps/step0-download", () => ({
  run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }),
  recoverPendingMoves: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/steps/step1-parse", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step2-validate-parse", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step3-sap-query", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step4-upload", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step5-reconcile", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step6-notify", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step7-archive", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));

describe("runPipeline — heartbeat", () => {
  beforeEach(() => { _db = createTestDb(); });
  afterEach(() => { _db.close(); });

  it("escribe un registro 'heartbeat' al terminar aunque no haya correos nuevos", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    await runPipeline({});

    const row = _db.prepare(
      "SELECT fase_nombre, estado_resultado FROM pipeline_log WHERE fase_nombre = 'heartbeat'"
    ).get() as { fase_nombre: string; estado_resultado: string } | undefined;

    expect(row).toBeDefined();
    expect(row?.estado_resultado).toBe("OK");
  });

  it("no escribe 'download' cuando no hay correos (regresión: por eso se usa heartbeat)", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    await runPipeline({});

    const dl = _db.prepare(
      "SELECT COUNT(*) AS c FROM pipeline_log WHERE fase_nombre = 'download'"
    ).get() as { c: number };
    expect(dl.c).toBe(0);
  });
});
