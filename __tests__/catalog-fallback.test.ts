import { describe, it, expect } from "vitest";
import { resolveUnmatchedLine } from "@/lib/catalog-fallback";
import type { Config } from "@/lib/config";
import type { DocumentLine } from "@/lib/schemas";

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    workspaceRoot: "/tmp", dbPath: "/tmp/db", pedidosRawDir: "/tmp/raw",
    pedidosBackupsDir: "/tmp/b", pedidosReportsDir: "/tmp/r", pedidosIngresadosDir: "/tmp/i",
    emailProvider: "imap", emailUser: "", emailPass: "", emailHost: "", emailPort: 993,
    processUnreadOnly: false,
    msClientId: "", msTenantId: "", msClientSecret: "",
    smtpHost: "", smtpPort: 587, notifyEmail: "", notifyCcEmail: "", notifyAlertasEmail: "",
    sapBackendUrl: "", sapBackendApiKey: "",
    tenant: "tamaprint", tenantDisplayName: "Tamaprint", receptorKeywords: [],
    stagingFolderName: "", inboxFolderName: "", diferenciasFolder: "", manualReviewFolderName: "",
    cardCodePrefix: "CN",
    ...overrides,
  };
}

const line: DocumentLine = {
  SupplierCatNum: "SKU-NUEVO-123",
  Quantity: 25,
  UnitPrice: 500,
  DeliveryDate: "20260815",
  FreeText: "Texto original",
};

describe("resolveUnmatchedLine", () => {
  it("devuelve null cuando el tenant no tiene artículo genérico configurado (Tamaprint)", () => {
    const config = baseConfig({ genericPlaceholderItemCode: undefined });
    expect(resolveUnmatchedLine(config, line)).toBeNull();
  });

  it("sustituye la línea por el artículo genérico cuando está configurado (Flexo)", () => {
    const config = baseConfig({ genericPlaceholderItemCode: "102296" });
    const resolved = resolveUnmatchedLine(config, line);

    expect(resolved).not.toBeNull();
    expect(resolved!.SupplierCatNum).toBe("102296");
    // Cantidad real del pedido — el cliente pidió montar con la cantidad real
    expect(resolved!.Quantity).toBe(25);
    // Trazabilidad del código original + texto pedido por el cliente
    expect(resolved!.FreeText).toContain("Ojo revisar referencia");
    expect(resolved!.FreeText).toContain("SKU-NUEVO-123");
  });

  it("trunca el FreeText a 100 caracteres (límite de SAP DocumentLine.FreeText)", () => {
    const config = baseConfig({ genericPlaceholderItemCode: "102296" });
    const largo: DocumentLine = { ...line, SupplierCatNum: "X".repeat(200) };
    const resolved = resolveUnmatchedLine(config, largo);
    expect(resolved!.FreeText!.length).toBeLessThanOrEqual(100);
  });
});
