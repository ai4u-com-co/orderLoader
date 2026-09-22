/**
 * Regresión — incidente real (VM Tamaprint, 2026-09-17, 21:00 y 22:00 UTC): 2 corridas
 * seguidas de step:0 download fallaron con "Error de conexión IMAP: Error: Command failed"
 * (alerta automática por 100% de error), y justo después de "pipeline done" aparecía en el
 * log crudo de Docker una EXCEPCIÓN NO CAPTURADA a nivel de proceso: "Error: Socket timeout" /
 * "⨯ uncaughtException". El proceso no murió (la corrida de las 23:00 procesó bien), pero es
 * un patrón peligroso: cualquier evento 'error' futuro del socket que Node no pueda entregar
 * a un listener puede sí tumbar el proceso.
 *
 * Causa raíz: `ImapFlow` es un `EventEmitter`. `lib/steps/step0-download.ts` crea el cliente
 * (`new ImapFlow({...})`) y nunca le agrega `.on("error", ...)`. Cuando el socket subyacente
 * emite un error de forma asíncrona — típicamente DESPUÉS de que connect()/login() ya se
 * resolvió o rechazó, sin relación directa con la promesa que el código sí espera — Node
 * lanza ese evento como excepción no capturada por no tener oyentes registrados.
 *
 * Este test no reproduce el "Command failed" original (eso es un fallo real del proveedor,
 * no del código); reproduce el segundo síntoma, que sí es un bug de nuestro código: un evento
 * 'error' asíncrono del cliente IMAP nunca debe escapar como excepción de proceso.
 *
 * Antes del fix: falla — el process-level 'uncaughtException' SÍ se dispara.
 * Después del fix: pasa — step0 registra su propio listener y el evento se maneja ahí.
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

/** Mock mínimo de ImapFlow: resuelve una sesión sin correos, y emite un 'error' asíncrono
 *  (setImmediate) DESPUÉS de connect() — igual que el "Socket timeout" real, desacoplado
 *  de cualquier promesa que el código de step0 esté esperando. */
class MockImapFlow extends EventEmitter {
  async connect() {
    setImmediate(() => this.emit("error", new Error("Socket timeout")));
  }
  async mailboxCreate() { /* no-op */ }
  async getMailboxLock() { return { release: () => {} }; }
  async *fetch() { /* sin correos */ }
  async logout() { /* no-op */ }
}

vi.mock("imapflow", () => ({ ImapFlow: MockImapFlow }));

describe("step0-download — el cliente IMAP no debe filtrar excepciones no capturadas (incidente 17-sep-2026)", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step0-imap-error-"));
    Object.assign(process.env, envBase(tmpDir));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("un 'error' emitido por el socket IMAP después de connect() no llega a uncaughtException", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (err: unknown) => uncaught.push(err);
    process.on("uncaughtException", onUncaught);

    try {
      const { run } = await import("@/lib/steps/step0-download");
      await run();
      // Deja correr el microtask/macrotask del setImmediate que dispara el 'error' mockeado.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off("uncaughtException", onUncaught);
    }

    expect(uncaught).toEqual([]);
  });
});
