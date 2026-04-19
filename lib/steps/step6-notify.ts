/**
 * Step 6: Enviar correo resumen de pedidos procesados.
 *
 * Recoge todos los pedidos en estado terminal (VALIDADO, ERROR_*…),
 * genera un email HTML con resumen + detalle de discrepancias y lo envía.
 * Transiciona los pedidos a NOTIFICADO para que step7 los archive.
 *
 * VALIDADO | ERROR_* | SAP_MONTADO → NOTIFICADO
 */

import path from "path";
import nodemailer from "nodemailer";
import { getConfig } from "../config";
import { getDb, logPipeline } from "../db";
import { buildSubjectForOrder, buildHtmlForOrder } from "./step6-templates";

const LOGO_PATH = path.resolve(process.cwd(), "public/brand/logos/Export/Logo V1 - Naranja.png");

export interface StepResult {
  procesados: number;
  errores: number;
  saltados: number;
  detalles: string[];
}

const ESTADOS_A_NOTIFICAR = [
  "VALIDADO", "SAP_MONTADO",
  "ERROR_DUPLICADO", "ERROR_ITEMS", "ERROR_SAP", "ERROR_PARSE", "ERROR_VALIDACION",
] as const;

export async function run(): Promise<StepResult> {
  const config = getConfig();
  const result: StepResult = { procesados: 0, errores: 0, saltados: 0, detalles: [] };
  const db = getDb();

  const placeholders = ESTADOS_A_NOTIFICAR.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT * FROM pedidos_maestro WHERE estado IN (${placeholders})`
  ).all(...ESTADOS_A_NOTIFICAR) as Array<Record<string, unknown>>;

  if (!rows.length) {
    result.detalles.push("No hay pedidos pendientes de notificación");
    return result;
  }

  if (!config.emailUser || !config.emailPass || !config.smtpHost) {
    for (const row of rows) {
      logPipeline(db, String(row.orden_compra), 6, "notify", "ERROR",
        "Faltan credenciales SMTP — pedido pendiente de notificación");
    }
    result.errores = rows.length;
    result.detalles.push(`✗ Faltan credenciales SMTP — ${rows.length} pedido(s) sin notificar`);
    return result;
  }

  const fecha = new Date().toISOString().split("T")[0];
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    requireTLS: config.smtpPort !== 465,
    auth: { user: config.emailUser, pass: config.emailPass },
  });

  const now = new Date().toISOString();

  for (const row of rows) {
    const oc = String(row.orden_compra);
    try {
      await transporter.sendMail({
        from: config.emailUser,
        to: config.notifyEmail,
        cc: "pedidos@tamaprint.com",
        subject: buildSubjectForOrder(row),
        html: buildHtmlForOrder(db, row, fecha),
        attachments: [
          { filename: "logo.png", path: LOGO_PATH, cid: "logo" },
        ],
      });

      db.prepare(`
        UPDATE pedidos_maestro SET estado='NOTIFICADO', ts_notified=?, fase_actual=6
        WHERE orden_compra=?
      `).run(now, oc);
      logPipeline(db, oc, 6, "notify", "OK", `Email → ${config.notifyEmail}`);
      result.procesados++;
      result.detalles.push(`✓ OC ${oc} → NOTIFICADO`);
    } catch (e) {
      logPipeline(db, oc, 6, "notify", "ERROR", String(e).slice(0, 120));
      result.errores++;
      result.detalles.push(`✗ OC ${oc}: ${String(e).slice(0, 80)}`);
    }
  }

  return result;
}
