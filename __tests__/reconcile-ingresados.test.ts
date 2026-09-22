/**
 * Regresión — TAMA-048 (2026-09-21/22): la OC 4500326920 de COMODIN llegó al buzón
 * mientras la VM estaba apagada y quedó en "Ingresados" sin que el pipeline la
 * hubiera tocado nunca — invisible hasta que el cliente la encontró a mano.
 *
 * Este test verifica el mecanismo de detección: un correo en Ingresados cuyo
 * Message-ID no está registrado en `imap_pending_moves` (el pipeline nunca lo
 * movió) debe salir como huérfano; uno que el pipeline SÍ movió no debe salir.
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

const MENSAJES = [
  {
    uid: 100,
    envelope: {
      messageId: "<registrado@proveedor.com>",
      subject: "OC 111 — el pipeline SÍ la movió",
      from: [{ address: "cliente@proveedor.com" }],
    },
    internalDate: new Date("2026-09-20T12:00:00Z"),
  },
  {
    uid: 101,
    envelope: {
      messageId: "<huerfano@proveedor.com>",
      subject: "4500326920",
      from: [{ address: "cliente@proveedor.com" }],
    },
    internalDate: new Date("2026-09-21T19:46:00Z"),
  },
];

class MockImapFlow extends EventEmitter {
  async connect() {}
  async getMailboxLock() {
    return { release: () => {} };
  }
  async search() {
    return MENSAJES.map((m) => m.uid);
  }
  async *fetch(uids: number[]) {
    for (const uid of uids) {
      const m = MENSAJES.find((x) => x.uid === uid);
      if (m) yield m;
    }
  }
  async logout() {}
}

vi.mock("imapflow", () => ({ ImapFlow: MockImapFlow }));
vi.mock("@/lib/mailer", () => ({ sendAlertEmail: vi.fn().mockResolvedValue(undefined) }));

describe("reconcile-ingresados — detecta correos que llegaron a Ingresados sin pasar por el pipeline", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-ingresados-"));
    Object.assign(process.env, envBase(tmpDir));
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("excluye el correo que el pipeline registró haber movido, y marca huérfano el que no", async () => {
    const { findCorreosHuerfanosEnIngresados } = await import("@/lib/reconcile-ingresados");
    const { getDb, migrate, insertPendingMove, completePendingMove } = await import("@/lib/db");
    migrate();

    const db = getDb();
    const id = insertPendingMove(db, "<registrado@proveedor.com>", 100, "INBOX.A A REVISAR IA", "INBOX.A B INGRESADO");
    completePendingMove(db, id);

    const huerfanos = await findCorreosHuerfanosEnIngresados(30);

    expect(huerfanos).toHaveLength(1);
    expect(huerfanos[0].messageId).toBe("<huerfano@proveedor.com>");
    expect(huerfanos[0].asunto).toBe("4500326920");
  });

  it("no marca huérfano si el move quedó PENDIENTE (aún no completó) — evita falsos positivos en corridas en curso", async () => {
    const { findCorreosHuerfanosEnIngresados } = await import("@/lib/reconcile-ingresados");
    const { getDb, migrate, insertPendingMove, completePendingMove } = await import("@/lib/db");
    migrate();

    const db = getDb();
    // Piso: al menos un move ya rastreado y completado, para que la ventana exista.
    const baseId = insertPendingMove(db, "<otro-cualquiera@proveedor.com>", 999, "INBOX.A A REVISAR IA", "INBOX.A B INGRESADO");
    completePendingMove(db, baseId);

    // El registrado (uid 100) queda PENDIENTE (no completado) — solo debe importar el
    // huérfano real (uid 101), que de por sí nunca tuvo fila.
    insertPendingMove(db, "<registrado@proveedor.com>", 100, "INBOX.A A REVISAR IA", "INBOX.A B INGRESADO");

    const huerfanos = await findCorreosHuerfanosEnIngresados(30);
    const uids = huerfanos.map((h) => h.uid);
    expect(uids).toContain(101);
  });

  it("manda un correo resumen con el conteo de huérfanos cuando hay al menos uno", async () => {
    const { reconciliarIngresadosYAlertar } = await import("@/lib/reconcile-ingresados");
    const { getDb, migrate, insertPendingMove, completePendingMove } = await import("@/lib/db");
    migrate();

    // Piso: un move rastreado que no es ninguno de los 2 mensajes reales de esta prueba.
    const db = getDb();
    const baseId = insertPendingMove(db, "<otro-cualquiera@proveedor.com>", 999, "INBOX.A A REVISAR IA", "INBOX.A B INGRESADO");
    completePendingMove(db, baseId);

    const { sendAlertEmail } = await import("@/lib/mailer");
    const huerfanos = await reconciliarIngresadosYAlertar(30);

    expect(huerfanos).toHaveLength(2); // ninguno de los 2 está registrado → ambos salen huérfanos
    expect(sendAlertEmail).toHaveBeenCalledTimes(1);
    const [subject] = vi.mocked(sendAlertEmail).mock.calls[0];
    expect(subject).toContain("2 correo(s) en Ingresados");
  });

  it("nunca mira antes del primer movimiento rastreado — evita el aluvión de falsos positivos del historial viejo (2026-09-22)", async () => {
    const { findCorreosHuerfanosEnIngresados } = await import("@/lib/reconcile-ingresados");
    const { migrate } = await import("@/lib/db");
    migrate();

    // Sin ningún move rastreado todavía: no hay piso confiable, no se marca nada.
    const huerfanos = await findCorreosHuerfanosEnIngresados(30);
    expect(huerfanos).toEqual([]);
  });

  it("no manda correo si no hay huérfanos", async () => {
    const { reconciliarIngresadosYAlertar } = await import("@/lib/reconcile-ingresados");
    const { getDb, migrate, insertPendingMove, completePendingMove } = await import("@/lib/db");
    migrate();

    const db = getDb();
    for (const m of MENSAJES) {
      const id = insertPendingMove(db, m.envelope.messageId, m.uid, "INBOX.A A REVISAR IA", "INBOX.A B INGRESADO");
      completePendingMove(db, id);
    }

    const { sendAlertEmail } = await import("@/lib/mailer");
    const huerfanos = await reconciliarIngresadosYAlertar(30);

    expect(huerfanos).toHaveLength(0);
    expect(sendAlertEmail).not.toHaveBeenCalled();
  });

  it("se omite para Flexoimpresos (Microsoft Graph) — mecanismo de carpetas distinto, no cubierto", async () => {
    process.env.EMAIL_PROVIDER = "microsoft";
    process.env.MS_CLIENT_ID = "x";
    process.env.MS_TENANT_ID = "x";
    process.env.MS_CLIENT_SECRET = "x";

    const { findCorreosHuerfanosEnIngresados } = await import("@/lib/reconcile-ingresados");
    const { migrate } = await import("@/lib/db");
    migrate();

    const huerfanos = await findCorreosHuerfanosEnIngresados(30);
    expect(huerfanos).toEqual([]);

    delete process.env.EMAIL_PROVIDER;
    delete process.env.MS_CLIENT_ID;
    delete process.env.MS_TENANT_ID;
    delete process.env.MS_CLIENT_SECRET;
  });
});
