/**
 * Envía un correo de prueba con el template branded a una dirección específica.
 * Uso: npx tsx scripts/test-email-template.ts
 */

import { readFileSync } from "fs";
// Load .env manually (dotenv not installed)
try {
  const raw = readFileSync(".env", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* ignore */ }
import path from "path";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import { buildSubjectForOrder, buildHtmlForOrder } from "../lib/steps/step6-templates";

// ─── DB en memoria con datos de prueba ───────────────────────────────────────
const db = new Database(":memory:");

db.exec(`
  CREATE TABLE pedidos_detalle (
    id INTEGER PRIMARY KEY, orden_compra TEXT,
    codigo_producto TEXT, cantidad REAL, precio_unitario REAL, subtotal_item REAL
  );
  CREATE TABLE pipeline_log (
    id INTEGER PRIMARY KEY, orden_compra TEXT, fase_nombre TEXT,
    input_tokens INTEGER, output_tokens INTEGER
  );
`);

const insertDetalle = db.prepare(
  "INSERT INTO pedidos_detalle (orden_compra, codigo_producto, cantidad, precio_unitario, subtotal_item) VALUES (?, ?, ?, ?, ?)"
);
const insertLog = db.prepare(
  "INSERT INTO pipeline_log (orden_compra, fase_nombre, input_tokens, output_tokens) VALUES (?, ?, ?, ?)"
);

// OC 1: SAP_MONTADO — éxito limpio
insertDetalle.run("OC-2025-4872", "CAMISETA-001",  12, 45_000, 540_000);
insertDetalle.run("OC-2025-4872", "PANTALON-002",   6, 98_500, 591_000);
insertDetalle.run("OC-2025-4872", "BOLSO-DAMA-003", 4, 125_000, 500_000);
insertLog.run("OC-2025-4872", "parse", 48_320, 2_175);

// ─── Fila de pedido mock ──────────────────────────────────────────────────────
const fecha = new Date().toLocaleDateString("es-CO", {
  year: "numeric", month: "long", day: "numeric",
});

const rowOk: Record<string, unknown> = {
  orden_compra:         "OC-2025-4872",
  cliente_nombre:       "Comodin S.A.S",
  estado:               "SAP_MONTADO",
  sap_doc_num:          "2025-001483",
  error_msg:            null,
  items_excluidos:      null,
  validacion_resultado: null,
};

const rowWarn: Record<string, unknown> = {
  orden_compra:         "OC-2025-4871",
  cliente_nombre:       "Hermeco S.A.",
  estado:               "ERROR_VALIDACION",
  sap_doc_num:          "2025-001482",
  error_msg:            null,
  items_excluidos:      null,
  validacion_resultado: JSON.stringify({
    docNum: "2025-001482",
    diferencias: [
      { campo: "Precio [CAMISETA-001]", pdf: 45_000, sap: 47_800 },
      { campo: "Precio [PANTALON-002]", pdf: 98_500, sap: 95_000 },
      { campo: "Total",                 pdf: 1_631_000, sap: 1_641_800 },
    ],
  }),
};

// ─── SMTP ─────────────────────────────────────────────────────────────────────
const smtpHost = process.env.EMAIL_SMTP_HOST ?? "send.one.com";
const smtpPort = parseInt(process.env.EMAIL_SMTP_PORT ?? "587");
const emailUser = process.env.EMAIL_USER ?? "";
const emailPass = process.env.EMAIL_PASS ?? "";

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort !== 465,
  auth: { user: emailUser, pass: emailPass },
});

const LOGO_PATH = path.resolve(process.cwd(), "public/brand/logos/Export/Logo V1 - Naranja.png");

async function send(row: Record<string, unknown>, label: string) {
  const html    = buildHtmlForOrder(db, row, fecha);
  const subject = buildSubjectForOrder(row);
  await transporter.sendMail({
    from:        emailUser,
    to:          "mgarciap333@gmail.com",
    subject:     `[TEST] ${subject}`,
    html,
    attachments: [{ filename: "logo.png", path: LOGO_PATH, cid: "logo" }],
  });
  console.log(`✓ Enviado: ${label}`);
}

(async () => {
  console.log(`Enviando emails de prueba desde ${emailUser} → mgarciap333@gmail.com …`);
  await send(rowOk,   "SAP_MONTADO (éxito)");
  await send(rowWarn, "ERROR_VALIDACION (discrepancias)");
  console.log("Listo. Revisa tu bandeja de entrada.");
})();
