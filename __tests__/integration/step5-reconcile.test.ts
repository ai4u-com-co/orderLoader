import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { createTestDb, insertTestPedido, buildSapOrderFixture } from "../helpers/test-db";
import type Database from "better-sqlite3";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSapGet = vi.fn();
vi.mock("@/lib/sap-gateway", () => ({
  getActiveSap: vi.fn().mockResolvedValue({ get: mockSapGet }),
  clearActiveSap: vi.fn(),
}));

vi.mock("@/lib/mailer", () => ({ sendAlertEmail: vi.fn().mockResolvedValue(undefined) }));

let _db: Database.Database;
vi.mock("@/lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...original,
    getDb: () => _db,
    logPipeline: vi.fn(),
  };
});

// ─────────────────────────────────────────────────────────────────────────────

describe("step5-reconcile — FLX-059 líneas placeholder", () => {
  let tmpDir: string;

  beforeEach(() => {
    _db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "step5-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    _db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupPedidoMontado(oc: string, items: string[], placeholderCodes: string[]) {
    const carpeta = path.join(tmpDir, oc);
    fs.mkdirSync(carpeta, { recursive: true });
    const fixture = buildSapOrderFixture(oc, "CN123456789", items);
    fs.writeFileSync(path.join(carpeta, "data_extraida.json"), JSON.stringify(fixture));
    insertTestPedido(_db, { orden_compra: oc, estado: "SAP_MONTADO", carpeta_origen: carpeta });
    _db.prepare(`
      UPDATE pedidos_maestro SET sap_doc_entry = 111, items_placeholder = ?
      WHERE orden_compra = ?
    `).run(JSON.stringify(placeholderCodes), oc);
    return fixture;
  }

  it("no reporta 'Artículo faltante en SAP' para una línea sustituida por el genérico", async () => {
    const oc = "OC-REC-PH-001";
    const fixture = setupPedidoMontado(oc, ["SKU-EXISTS", "SKU-NEW"], ["SKU-NEW"]);

    // SAP devuelve: la línea real + la línea placeholder con el código genérico 102296
    mockSapGet.mockResolvedValue({
      DocEntry: 111, DocNum: "77", NumAtCard: fixture.NumAtCard, CardCode: fixture.CardCode,
      DocDate: fixture.DocDate, DocDueDate: fixture.DocDueDate, TaxDate: fixture.TaxDate,
      DocumentLines: [
        { SupplierCatNum: "SKU-EXISTS", Quantity: 10, UnitPrice: 1000, Price: 1000, ShipDate: "2026-01-01" },
        { SupplierCatNum: "102296", Quantity: 10, UnitPrice: 0, Price: 0, ShipDate: "2026-01-01" },
      ],
    });

    const { run } = await import("@/lib/steps/step5-reconcile");
    await run();

    const row = _db.prepare("SELECT estado, validacion_resultado FROM pedidos_maestro WHERE orden_compra = ?")
      .get(oc) as { estado: string; validacion_resultado: string };

    const { diferencias } = JSON.parse(row.validacion_resultado) as { diferencias: Array<{ campo: string; pdf: unknown }> };

    expect(diferencias.some(d => d.campo === "Artículo faltante en SAP")).toBe(false);
    expect(diferencias.some(d => d.campo === "Pendiente de revisión (artículo genérico)" && d.pdf === "SKU-NEW")).toBe(true);
    // La línea placeholder SÍ cuenta para el total esperado — no debe reportar "líneas totales"
    expect(diferencias.some(d => d.campo === "líneas totales")).toBe(false);
  });

  it("queda en ERROR_VALIDACION (no VALIDADO) cuando hay una línea pendiente de revisión", async () => {
    const oc = "OC-REC-PH-002";
    const fixture = setupPedidoMontado(oc, ["SKU-NEW"], ["SKU-NEW"]);

    mockSapGet.mockResolvedValue({
      DocEntry: 111, DocNum: "78", NumAtCard: fixture.NumAtCard, CardCode: fixture.CardCode,
      DocDate: fixture.DocDate, DocDueDate: fixture.DocDueDate, TaxDate: fixture.TaxDate,
      DocumentLines: [
        { SupplierCatNum: "102296", Quantity: 10, UnitPrice: 0, Price: 0, ShipDate: "2026-01-01" },
      ],
    });

    const { run } = await import("@/lib/steps/step5-reconcile");
    await run();

    const row = _db.prepare("SELECT estado FROM pedidos_maestro WHERE orden_compra = ?").get(oc) as { estado: string };
    // Con diferencias pendientes, el pedido se marca para revisión humana — es la señal
    // esperada por el cliente para saber qué pedidos tienen artículos por identificar.
    expect(row.estado).toBe("ERROR_VALIDACION");
  });
});
