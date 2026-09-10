/**
 * Regresión — cluster de errores real (mission-control, tamaprint, 24h): 17 ERROR_DUPLICADO
 * con DocEntry real de SAP ("OC ya existe en SAP — posible reingesta repetida sin marcar
 * como procesada").
 *
 * Causa raíz (lib/steps/step0-download.ts): el loop de descarga relee "1:*" desde INBOX en
 * cada llamada a step0() y procesa TODO lo que encuentra ahí, sin excluir mensajes que ya se
 * descargaron en una pasada anterior. Cuando `imapClient.messageMove()` falla (red, IMAP
 * flaky de one.com, etc.), el fallback solo marca \Seen — el correo NO sale de INBOX. Como el
 * propio código documenta ("el INBOX es la fuente de verdad... sin importar el flag de
 * leído/no leído"), \Seen no evita que se vuelva a procesar: la siguiente llamada a step0()
 * (misma corrida del pipeline, que llama a step0() en loop hasta que no hay correos nuevos)
 * vuelve a descargar el MISMO correo desde cero — nueva carpeta, nuevo parseo AI, nuevo
 * INSERT OR REPLACE en pedidos_maestro. Si la primera pasada ya llegó a subirse a SAP, la
 * reingesta cae en ERROR_DUPLICADO contra su propia carga anterior.
 *
 * El recovery real para esto ya existe (recoverPendingMoves(), que reintenta SOLO el move sin
 * reprocesar) y corre al inicio de cada runPipeline() — pero el loop de descarga no lo
 * consultaba antes de tratar un mensaje como nuevo.
 *
 * Fix: antes de procesar un mensaje, step0 verifica si su Message-ID ya tiene un
 * imap_pending_moves en estado PENDIENTE (lo dejó una pasada anterior cuyo move falló) y, si
 * es así, lo salta — dejando que recoverPendingMoves() resuelva el move sin duplicar el
 * pedido. Este test cubre esa función guardia (tieneMovePendiente) directamente contra una
 * BD real, replicando el escenario: móvil pendiente vs. completado vs. inexistente.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

describe("step0-download — tieneMovePendiente evita reprocesar un correo con move IMAP atascado", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step0-pending-move-"));
    Object.assign(process.env, envBase(tmpDir));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("mensaje sin ningún pending move → no se salta (es realmente nuevo)", async () => {
    const { migrate, getDb } = await import("@/lib/db");
    const { tieneMovePendiente } = await import("@/lib/steps/step0-download");
    migrate();
    const db = getDb();

    expect(tieneMovePendiente(db, "<msg-nunca-visto@cliente.com>")).toBe(false);
  });

  it("mensaje con move PENDIENTE (falló en una pasada anterior) → se salta", async () => {
    const { migrate, getDb, insertPendingMove } = await import("@/lib/db");
    const { tieneMovePendiente } = await import("@/lib/steps/step0-download");
    migrate();
    const db = getDb();

    const messageId = "<oc-4500316345@cliente.com>";
    insertPendingMove(db, messageId, 42, "INBOX", "INBOX.STAGING", "/data/pedidos/raw/Cliente/carpeta");

    expect(tieneMovePendiente(db, messageId)).toBe(true);
  });

  it("mensaje cuyo move ya se completó (recovery exitoso) → NO se salta más", async () => {
    const { migrate, getDb, insertPendingMove, completePendingMove } = await import("@/lib/db");
    const { tieneMovePendiente } = await import("@/lib/steps/step0-download");
    migrate();
    const db = getDb();

    const messageId = "<oc-4601620067@cliente.com>";
    const id = insertPendingMove(db, messageId, 7, "INBOX", "INBOX.STAGING", "/data/pedidos/raw/Cliente/carpeta");
    completePendingMove(db, id);

    expect(tieneMovePendiente(db, messageId)).toBe(false);
  });
});
