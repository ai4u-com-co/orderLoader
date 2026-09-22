/**
 * Regresión — TAMA-048 (2026-09-22): la reconciliación diaria de Ingresados
 * (lib/reconcile-ingresados.ts) marcó 73 correos como "huérfanos" en su primera
 * corrida real. Causa: `moveInImap` (este archivo) mueve el correo al destino final
 * con `imap.messageMove(...)` directo — nunca llama a `insertPendingMove`. La tabla
 * `imap_pending_moves` solo tenía filas del movimiento INICIAL de step0
 * (INBOX→staging/revisión), nunca del movimiento FINAL de step7 (staging→Ingresados/
 * Sandra/Diferencias). Cualquier herramienta que confiara en esa tabla para saber
 * "¿el pipeline puso este correo acá?" veía falsos negativos en el 100% de los casos.
 *
 * Antes del fix: falla — no hay fila en imap_pending_moves para el movimiento final.
 * Después del fix: pasa — queda una fila COMPLETADO con el message_id real y el
 * destino final correcto.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";

let tmpDir: string;
let carpetaOrigen: string;

const MESSAGE_ID = "<caso-real-tama-048@proveedor.com>";
const UID_EN_STAGING = 500;

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

class MockImapFlow extends EventEmitter {
  async connect() {}
  async mailboxCreate() {}
  async getMailboxLock() {
    return { release: () => {} };
  }
  async *fetch() {
    yield { uid: UID_EN_STAGING, envelope: { messageId: MESSAGE_ID } };
  }
  async messageMove() {}
  async logout() {}
}

vi.mock("imapflow", () => ({ ImapFlow: MockImapFlow }));

describe("step7-archive — registra el movimiento final a Ingresados (TAMA-048)", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step7-track-move-"));
    Object.assign(process.env, envBase(tmpDir));
    vi.resetModules();

    carpetaOrigen = path.join(tmpDir, "pedidos", "raw", "Comodin", "test-oc");
    fs.mkdirSync(carpetaOrigen, { recursive: true });
    fs.writeFileSync(
      path.join(carpetaOrigen, "correo_metadata.json"),
      JSON.stringify({
        imap_uid: UID_EN_STAGING,
        message_id: MESSAGE_ID,
        imap_staging_folder: "INBOX.A A REVISAR IA",
        has_extra_files: false,
      })
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("inserta una fila COMPLETADO en imap_pending_moves con el destino real (A B INGRESADO)", async () => {
    const { getDb, migrate } = await import("@/lib/db");
    migrate();
    const db = getDb();

    db.prepare(
      `INSERT INTO pedidos_maestro (nit_cliente, orden_compra, estado, carpeta_origen)
       VALUES (?, ?, 'NOTIFICADO', ?)`
    ).run("900166474", "TAMA-048-TEST", carpetaOrigen);

    const { run } = await import("@/lib/steps/step7-archive");
    await run();

    const rows = db
      .prepare(
        `SELECT message_id, carpeta_destino, estado FROM imap_pending_moves
         WHERE message_id = ?`
      )
      .all(MESSAGE_ID) as Array<{ message_id: string; carpeta_destino: string; estado: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].estado).toBe("COMPLETADO");
    expect(rows[0].carpeta_destino).toBe("INBOX.A B INGRESADO");
  });
});
