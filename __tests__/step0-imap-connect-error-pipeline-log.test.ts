/**
 * Regresión — incidente real (VM Tamaprint, 2026-09-17): 2 corridas seguidas de step:0
 * download fallaron con "Error de conexión IMAP: Error: Command failed" y dispararon la
 * alerta automática de "100% de error 2 corridas seguidas" — pero AL REVISAR `pipeline_log`
 * después del incidente, no había ningún registro de esas 2 corridas: el fallo solo quedaba
 * en el log crudo de Docker (`console.error`/stdout), nunca en la tabla que alimenta el
 * dashboard y los reportes.
 *
 * Causa raíz: el catch que envuelve toda la sesión IMAP (`run()`, lib/steps/step0-download.ts)
 * solo hace `result.errores++` y `result.detalles.push(...)` — nunca llama a `logPipeline()`.
 * Cualquier fallo ANTES de la primera línea exitosa (connect/login/mailboxCreate/lock) queda
 * invisible para quien solo mira `pipeline_log`.
 *
 * Antes del fix: falla — no hay ninguna fila en pipeline_log tras el fallo de conexión.
 * Después del fix: pasa — queda una fila fase_nombre="download", estado_resultado="ERROR".
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir: string;

function envBase(dataDir: string) {
  return {
    DATA_DIR: dataDir,
    EMAIL_USER: "pedidos@tamaprint.com",
    NOTIFY_EMAIL: "pedidos@tamaprint.com",
    ANTHROPIC_API_KEY: "test-key",
    TENANT: "tamaprint",
    CARD_CODE_PREFIX: "CN",
    RECEPTOR_KEYWORDS: "TAMAPRINT",
    EMAIL_PASS: "x",
    EMAIL_HOST: "imap.example.com",
    SAP_BACKEND_URL: "http://localhost:4100",
    SAP_BACKEND_API_KEY: "x",
  };
}

/** Mock de ImapFlow cuyo connect() rechaza — replica "Error: Command failed" real. */
class MockImapFlowConnectFails extends EventEmitter {
  async connect() {
    throw new Error("Command failed");
  }
  async mailboxCreate() { /* no-op */ }
  async getMailboxLock() { return { release: () => {} }; }
  async *fetch() { /* no llega a usarse */ }
  async logout() { /* no-op */ }
}

vi.mock("imapflow", () => ({ ImapFlow: MockImapFlowConnectFails }));

describe("step0-download — un fallo de conexión IMAP debe quedar en pipeline_log (incidente 17-sep-2026)", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step0-imap-connect-fail-"));
    Object.assign(process.env, envBase(tmpDir));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("registra el fallo de conexión en pipeline_log con fase_nombre=download y estado ERROR", async () => {
    const { run } = await import("@/lib/steps/step0-download");
    const { getDb, migrate } = await import("@/lib/db");
    migrate();

    const result = await run();
    expect(result.errores).toBe(1);
    expect(result.detalles.some((d) => d.includes("Error de conexión IMAP"))).toBe(true);

    const db = getDb();
    const rows = db
      .prepare(
        `SELECT fase_nombre, estado_resultado, mensaje FROM pipeline_log
         WHERE fase_nombre = 'download' AND estado_resultado = 'ERROR'
         ORDER BY id DESC LIMIT 1`
      )
      .all() as Array<{ fase_nombre: string; estado_resultado: string; mensaje: string }>;

    expect(rows.length).toBe(1);
    expect(rows[0].mensaje).toContain("Error de conexión IMAP");
    expect(rows[0].mensaje).toContain("Command failed");
  });
});
