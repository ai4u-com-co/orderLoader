/**
 * Regresión — bug real confirmado en producción (VM Tamaprint, platform_logs): desde
 * 2026-08-18, docenas de PDFs que agotaron sus 3 reintentos de parseo AI quedaron en un
 * loop silencioso: cada corrida de step1 repetía el mensaje "reprocesando (registro DB
 * eliminado)" sin nunca reprocesar de verdad. 705 repeticiones acumuladas en 22 días para
 * un solo PDF (AllanPro/.../ORDEN_DE_COMPRA_ALIANZA-TAMAPRINT_MAY_26.pdf), y lo mismo para
 * docenas de otros — hasta el 2026-09-09, sin resolverse solos.
 *
 * Causa raíz (lib/steps/step1-parse.ts): cuando un PDF agota sus 3 reintentos, se escribe
 * `${pdf}.error` y se inserta un registro real en pedidos_maestro con una clave `pseudoOc`
 * (carpeta+nombre del PDF). Pero el marcador `${pdf}.done` que se escribe DESPUÉS (para que
 * la próxima corrida use el "check silencioso") guardaba el string literal "error", NO esa
 * misma clave. El check "¿la OC del .done sigue en la BD?" (pensado para detectar cuando un
 * admin borra el registro desde el dashboard y forzar un reproceso real) buscaba entonces
 * `orden_compra = 'error'`, que NUNCA existe — así que en TODAS las corridas futuras
 * disparaba la rama de "reprocesar" (borra el .done, loguea el mensaje), pero caía derecho
 * al chequeo de `.error` (que seguía existiendo, nunca se limpiaba) y volvía a saltarse el
 * PDF, re-escribiendo el mismo `.done` = "error". Loop infinito: mensaje de "reprocesando"
 * cada corrida, cero reprocesos reales — y de paso, la recuperación manual documentada en
 * el propio comentario del código (admin borra el registro del dashboard → debería
 * reprocesar) quedaba rota para CUALQUIER pedido que hubiera tocado alguna vez el estado
 * de error, sin importar hace cuánto.
 *
 * Fix: guardar en `.done` la MISMA clave (`pseudoOcDePdfEnError`) que se insertó en la BD,
 * y al detectar que el registro fue borrado, limpiar también `.error`/`.retries` — así un
 * reproceso real vuelve a ser posible, y mientras el registro de error siga en la BD, el
 * PDF se salta en silencio (sin el mensaje engañoso) en vez de loopear para siempre.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const streamMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { stream: (...args: unknown[]) => streamMock(...args) };
    static APIError = class extends Error {};
  }
  return { default: FakeAnthropic };
});

vi.mock("@/lib/pdf-vision", () => ({
  pdfToImages: vi.fn().mockResolvedValue({ pages: [Buffer.from("fake-png")], pageCount: 1 }),
  buildVisionContent: vi.fn().mockReturnValue([]),
}));

vi.mock("pdf-parse/lib/pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({
    text: "TAMAPRINT S.A.S. — NIT 800069933 — Orden de compra de prueba con texto suficiente.",
  }),
}));

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

// Falla SIEMPRE con un issue que NO es (solo) DocType, para evitar el retry inmediato
// especial de DocType (ver step1-parse-doctype-retry.test.ts) y mantener predecible que
// cada llamada a run() gasta exactamente 1 intento de parseWithAI por PDF.
function fakeBadMessage() {
  return {
    content: [{ type: "text", text: JSON.stringify({
      DocType: "dDocument_Items",
      NumAtCard: "", // inválido a propósito — Zod rechaza, y no es el caso DocType-only
      CardCode: "CN800069933",
      DocDate: "20260908",
      DocDueDate: "20260924",
      TaxDate: "20260908",
      Comments: "",
      DocumentLines: [{ SupplierCatNum: "123", Quantity: 1, UnitPrice: 100, DeliveryDate: "20260924" }],
    }) }],
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

describe("step1-parse run() — un PDF en error no debe loopear 'reprocesando' para siempre", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step1-error-loop-"));
    Object.assign(process.env, envBase(tmpDir));
    streamMock.mockReset();
    streamMock.mockReturnValue({ finalMessage: vi.fn().mockResolvedValue(fakeBadMessage()) });
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const k of Object.keys(envBase(tmpDir))) delete process.env[k];
  });

  it("tras borrar el registro de error de la BD, la siguiente corrida reprocesa de verdad (no loopea)", async () => {
    const { migrate, getDb } = await import("@/lib/db");
    const { run } = await import("@/lib/steps/step1-parse");

    migrate();
    const db = getDb();
    db.prepare(`
      INSERT INTO clientes_aprobados (carpeta, nombre, nit_principal, card_code, prompt, nits_json, keywords_json, activo)
      VALUES ('AllanPro', 'Alianza SAS', '800069933', 'CN800069933', 'system prompt', '["800069933"]', '[]', 1)
    `).run();

    const config = (await import("@/lib/config")).getConfig();
    const carpetaPath = path.join(config.pedidosRawDir, "AllanPro", "2026-06-02_correo");
    fs.mkdirSync(carpetaPath, { recursive: true });
    fs.writeFileSync(path.join(carpetaPath, "correo_original.eml"), "From: x\n\n");
    const pdfFile = "ORDEN_DE_COMPRA_ALIANZA.pdf";
    fs.writeFileSync(path.join(carpetaPath, pdfFile), "fake-pdf-bytes");

    const doneMarker  = path.join(carpetaPath, `${pdfFile}.done`);
    const errorPath   = path.join(carpetaPath, `${pdfFile}.error`);
    const retriesPath = path.join(carpetaPath, `${pdfFile}.retries`);

    // 3 corridas: cada una gasta el intento de parseWithAI y suma un retry.
    for (let i = 0; i < 3; i++) {
      await run();
    }
    expect(fs.existsSync(errorPath)).toBe(true);
    expect(fs.existsSync(retriesPath)).toBe(false);

    // 4ta corrida: el chequeo de errorPath escribe el .done por primera vez.
    await run();
    expect(fs.existsSync(doneMarker)).toBe(true);
    const ocEnDone = fs.readFileSync(doneMarker, "utf8").trim();

    // La clave guardada en .done debe ser la MISMA que quedó insertada en pedidos_maestro
    // (no el sentinel literal "error" del bug original).
    expect(ocEnDone).not.toBe("error");
    const row = db.prepare("SELECT estado FROM pedidos_maestro WHERE orden_compra = ?").get(ocEnDone) as
      | { estado: string }
      | undefined;
    expect(row?.estado).toBe("ERROR_PARSE");

    // Admin borra el registro desde el dashboard, pidiendo un reproceso real.
    db.prepare("DELETE FROM pedidos_maestro WHERE orden_compra = ?").run(ocEnDone);

    // 5ta corrida: con el bug original, esto solo repite el mensaje "reprocesando" y
    // vuelve a saltar el PDF sin tocar errorPath/retriesPath — el test fallaría acá.
    const result = await run();

    expect(fs.existsSync(errorPath)).toBe(false);
    expect(result.detalles.some(d => d.includes(`Procesando: AllanPro/2026-06-02_correo/${pdfFile}`))).toBe(true);
  });
});
