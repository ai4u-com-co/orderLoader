/**
 * Reconciliación diaria: compara lo que HOY está en la carpeta "Ingresados" contra
 * lo que el propio pipeline registró haber movido ahí (`imap_pending_moves`).
 *
 * Caso real que motiva esto — TAMA-048 (2026-09-21/22): la OC 4500326920 de COMODIN
 * llegó al buzón mientras la VM estaba apagada (incidente de facturación GCP del
 * 2026-09-15) y quedó en "Ingresados" sin que el pipeline la hubiera tocado nunca —
 * sin fila en la base, sin SAP, sin correo de notificación. Invisible hasta que el
 * cliente la encontró a mano.
 *
 * Cualquier correo en Ingresados cuyo Message-ID NO aparezca en `imap_pending_moves`
 * (con `carpeta_destino` = esa carpeta y `estado='COMPLETADO'`) es sospechoso: llegó
 * ahí sin pasar por el pipeline. No es una heurística sobre el asunto o el remitente
 * — es la fuente de verdad exacta de lo que el pipeline sí procesó.
 */
import { ImapFlow } from "imapflow";
import { getConfig } from "./config";
import { getDb } from "./db";
import { sendAlertEmail } from "./mailer";
import { getLogger } from "./logger";

const log = getLogger("reconcile-ingresados");

export interface CorreoHuerfano {
  uid: number;
  messageId: string | null;
  asunto: string;
  de: string;
  recibido: string;
}

/** Solo tiene sentido para el proveedor IMAP: Flexoimpresos usa Microsoft Graph, con
 *  otro mecanismo de carpetas/movimiento (moveInGraph), no cubierto por esta función. */
export async function findCorreosHuerfanosEnIngresados(diasAtras = 7): Promise<CorreoHuerfano[]> {
  const config = getConfig();
  if (config.emailProvider !== "imap") {
    log.info(`emailProvider=${config.emailProvider} — reconciliación de Ingresados solo cubre IMAP, se omite.`);
    return [];
  }

  const db = getDb();
  const carpeta = `INBOX.${config.inboxFolderName}`;

  const client = new ImapFlow({
    host: config.emailHost,
    port: config.emailPort,
    secure: true,
    auth: { user: config.emailUser, pass: config.emailPass },
    logger: false,
  });
  client.on("error", (err) => {
    log.error(`IMAP socket error (post-conexión): ${String(err)}`);
  });

  const huerfanos: CorreoHuerfano[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock(carpeta, { readOnly: true });
    try {
      const desde = new Date(Date.now() - diasAtras * 24 * 3_600_000);
      const uids = (await client.search({ since: desde }, { uid: true })) || [];
      if (uids.length === 0) return huerfanos;

      const registrados = new Set(
        (
          db
            .prepare(
              `SELECT message_id FROM imap_pending_moves
               WHERE estado = 'COMPLETADO' AND carpeta_destino LIKE ?`
            )
            .all(`%${config.inboxFolderName}%`) as Array<{ message_id: string }>
        ).map((r) => r.message_id)
      );

      for await (const msg of client.fetch(uids, { uid: true, envelope: true, internalDate: true }, { uid: true })) {
        const messageId = msg.envelope?.messageId ?? null;
        if (messageId && registrados.has(messageId)) continue; // el pipeline sí lo movió

        huerfanos.push({
          uid: msg.uid,
          messageId,
          asunto: msg.envelope?.subject ?? "(sin asunto)",
          de: (msg.envelope?.from ?? []).map((a) => a.address).filter(Boolean).join(", "),
          recibido: new Date(msg.internalDate ?? Date.now()).toISOString(),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return huerfanos;
}

/** Corre la reconciliación y, si hay huérfanos, manda un único correo resumen —
 *  mismo mecanismo que las demás alertas del pipeline (lib/mailer.ts). */
export async function reconciliarIngresadosYAlertar(diasAtras = 7): Promise<CorreoHuerfano[]> {
  const huerfanos = await findCorreosHuerfanosEnIngresados(diasAtras);

  if (huerfanos.length === 0) {
    log.info(`Reconciliación Ingresados: sin huérfanos en los últimos ${diasAtras} días.`);
    return huerfanos;
  }

  const { tenantDisplayName } = getConfig();
  const filas = huerfanos
    .map(
      (h) =>
        `<tr><td>${h.recibido}</td><td>${escapeHtml(h.de)}</td><td>${escapeHtml(h.asunto)}</td></tr>`
    )
    .join("");

  await sendAlertEmail(
    `[OrderLoader/${tenantDisplayName}] ⚠ ${huerfanos.length} correo(s) en Ingresados sin pasar por el pipeline`,
    `<p>Estos correos están en la carpeta "Ingresados" pero el pipeline nunca registró
       haberlos movido ahí — llegaron con el sistema caído, o alguien los movió a mano.
       Si alguno corresponde a un pedido real, revisar si quedó grabado en SAP.</p>
     <table border="1" cellpadding="6" cellspacing="0">
       <tr><th>Recibido</th><th>De</th><th>Asunto</th></tr>
       ${filas}
     </table>`
  ).catch((e) => log.error(`No se pudo enviar la alerta de reconciliación: ${String(e)}`));

  log.info(`Reconciliación Ingresados: ${huerfanos.length} huérfano(s) detectados y notificados.`);
  return huerfanos;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
