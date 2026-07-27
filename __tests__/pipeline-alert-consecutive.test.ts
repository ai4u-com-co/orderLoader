/**
 * Endurecimiento de la alerta de "alta tasa de errores" tras el incidente 2026-07-24→27
 * (ver bug_sonnet5_thinking_content0): con el umbral anterior (>=50% de error en UNA
 * sola corrida) el sistema mandó decenas de correos de alerta durante esos 3 días, pero
 * se perdieron entre las notificaciones normales del propio pipeline en el mismo inbox —
 * Mariano se enteró por un cliente, no por la alerta.
 *
 * Nuevo criterio: solo alertar cuando DOS corridas consecutivas tuvieron 100% de error
 * (con al menos 1 orden procesada). Esto filtra el ruido de "un cliente mandó un PDF
 * raro" (que rara vez se repite dos corridas seguidas) y deja pasar solo el patrón que
 * de verdad indica un bug sistémico.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTestDb } from "./helpers/test-db";
import type Database from "better-sqlite3";

let _db: Database.Database;
let _parseResult: { procesados: number; errores: number; saltados: number; detalles: string[] };

vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return { ...original, getDb: () => _db, backupDb: vi.fn(), migrate: vi.fn() };
});
const sendAlertEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/mailer", () => ({ sendAlertEmail: sendAlertEmailMock }));
vi.mock("@/lib/sap-gateway", () => ({ getActiveSap: vi.fn(), clearActiveSap: vi.fn() }));
vi.mock("@/lib/config", () => ({
  getConfig: () => ({ tenantDisplayName: "Test", tenant: "test" }),
}));

vi.mock("@/lib/steps/step0-download", () => ({
  run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }),
  recoverPendingMoves: vi.fn().mockResolvedValue([]),
}));
// step1 es el único step con actividad real en este test — controlado por _parseResult
vi.mock("@/lib/steps/step1-parse", () => ({ run: vi.fn(() => Promise.resolve(_parseResult)) }));
vi.mock("@/lib/steps/step2-validate-parse", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step3-sap-query", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step4-upload", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step5-reconcile", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step6-notify", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));
vi.mock("@/lib/steps/step7-archive", () => ({ run: vi.fn().mockResolvedValue({ procesados: 0, errores: 0, saltados: 0, detalles: [] }) }));

const okRun = { procesados: 1, errores: 0, saltados: 0, detalles: [] };
const failedRun = { procesados: 0, errores: 1, saltados: 0, detalles: ["✗ Respuesta vacía del modelo"] };

describe("alertIfHighErrorRate — solo alerta con 2 corridas consecutivas al 100%", () => {
  beforeEach(() => {
    _db = createTestDb();
    sendAlertEmailMock.mockClear();
  });
  afterEach(() => { _db.close(); });

  it("NO alerta en la primera corrida con 100% de error (podría ser un PDF puntual)", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    _parseResult = failedRun;
    await runPipeline({});
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });

  it("SÍ alerta cuando la segunda corrida seguida también da 100% de error", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    _parseResult = failedRun;
    await runPipeline({}); // corrida 1: falla, no alerta (primera vez)
    await runPipeline({}); // corrida 2: falla de nuevo → alerta
    expect(sendAlertEmailMock).toHaveBeenCalledTimes(1);
    expect(sendAlertEmailMock.mock.calls[0][0]).toContain("Alta tasa de errores");
  });

  it("una corrida OK entre medio resetea el conteo (no alerta en la 3ra si la 2da fue OK)", async () => {
    const { runPipeline } = await import("@/lib/pipeline");
    _parseResult = failedRun;
    await runPipeline({}); // falla 1
    _parseResult = okRun;
    await runPipeline({}); // OK — resetea
    _parseResult = failedRun;
    await runPipeline({}); // falla 1 de nuevo (no la 2da consecutiva)
    expect(sendAlertEmailMock).not.toHaveBeenCalled();
  });
});
