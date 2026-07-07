import { describe, it, expect } from "vitest";
import { detectClientFromPdf, ajustarClasificacionPorTriage } from "@/lib/pdf-classify";
import type { TriageResult } from "@/lib/ai-triage";

const NITS = [
  { carpeta: "Hermeco", nits: ["890924167"] },
  { carpeta: "Comodin", nits: ["800069933"] },
];
const KEYWORDS = [
  { carpeta: "Hermeco", keywords: ["offcorss"] },
];

// Comportamiento histórico (producción): el NIT conocido (9 dígitos, sin DV) se busca
// como substring del texto normalizado. Esto tolera que el PDF traiga el dígito de
// verificación pegado o con guion — solo importan las 9 cifras del NIT.
describe("detectClientFromPdf — detección por NIT", () => {
  it("detecta NIT exacto de 9 dígitos", () => {
    expect(detectClientFromPdf("Orden de NIT 890924167 para impresión", NITS, KEYWORDS))
      .toEqual({ carpeta: "Hermeco", metodo: "nit" });
  });

  it("detecta NIT con puntos (normaliza quitando los puntos)", () => {
    expect(detectClientFromPdf("NIT: 890.924.167", NITS, KEYWORDS))
      .toEqual({ carpeta: "Hermeco", metodo: "nit" });
  });

  it("detecta aunque el PDF traiga el dígito de verificación pegado", () => {
    expect(detectClientFromPdf("NIT 8909241671", NITS, KEYWORDS))
      .toEqual({ carpeta: "Hermeco", metodo: "nit" });
  });

  it("detecta con DV separado por guion", () => {
    expect(detectClientFromPdf("NIT 890924167-1", NITS, KEYWORDS))
      .toEqual({ carpeta: "Hermeco", metodo: "nit" });
  });

  it("cae a keyword cuando no hay NIT", () => {
    expect(detectClientFromPdf("Pedido de OFFCORSS sin nit", NITS, KEYWORDS))
      .toEqual({ carpeta: "Hermeco", metodo: "keyword" });
  });

  it("retorna null cuando no hay señal", () => {
    expect(detectClientFromPdf("documento sin datos relevantes", NITS, KEYWORDS)).toBeNull();
  });
});

// Casos reales: "UN SOLO PROVEEDOR" (Tamaprint) y "MACROLAB"/"velez" (Flexo) — una
// keyword genérica matchea texto ajeno al cliente real (otra empresa de nombre similar,
// o el apellido de una persona en una firma de correo). El NIT es la señal confiable:
// si la IA de triage no logra confirmar el cliente para un match por keyword, no hay
// que confiar en la keyword.
describe("ajustarClasificacionPorTriage — prioridad del NIT sobre la keyword", () => {
  const clientNits = [{ carpeta: "CuerosVelez", nits: ["800191700"] }];

  const basePdf = {
    client: "CuerosVelez",
    isDirigidoAEmpresa: true,
    isApprovedOC: true, // heurística inicial (keyword "velez") lo había aprobado
    detectionMethod: "keyword" as const,
  };

  it("demota a revisión manual si la IA confirma orden_compra pero no puede identificar al cliente (bug real: Ana Cristina Vélez / Bouquet Aromas)", () => {
    const ia: TriageResult = {
      filename: "oc.pdf",
      tipo: "orden_compra",
      cliente: null,
      razon: "OC de BOUQUET AROMAS Y FRAGANCIAS S.A.S., cliente no está en lista aprobada",
    };
    const result = ajustarClasificacionPorTriage(basePdf, ia, clientNits);
    expect(result.isApprovedOC).toBe(false);
    // El nombre de carpeta no se toca: solo se retira la aprobación, no se inventa cliente.
    expect(result.client).toBe("CuerosVelez");
  });

  it("mantiene aprobado si la IA confirma el mismo cliente detectado por keyword", () => {
    const ia: TriageResult = { filename: "oc.pdf", tipo: "orden_compra", cliente: "CuerosVelez", razon: "NIT confirmado" };
    const result = ajustarClasificacionPorTriage(basePdf, ia, clientNits);
    expect(result.isApprovedOC).toBe(true);
    expect(result.client).toBe("CuerosVelez");
  });

  it("cambia al cliente correcto si la IA identifica uno distinto del detectado por keyword", () => {
    const ia: TriageResult = { filename: "oc.pdf", tipo: "orden_compra", cliente: "OtroCliente", razon: "NIT distinto confirmado" };
    const result = ajustarClasificacionPorTriage(basePdf, ia, clientNits);
    expect(result.isApprovedOC).toBe(true);
    expect(result.client).toBe("OtroCliente");
  });

  it("demota si la IA determina que el documento no es una orden de compra", () => {
    const ia: TriageResult = { filename: "cotizacion.pdf", tipo: "documento_relevante", cliente: null, razon: "Es una cotización, no una OC" };
    const result = ajustarClasificacionPorTriage(basePdf, ia, clientNits);
    expect(result.isApprovedOC).toBe(false);
  });

  it("demota si el triage IA no está disponible para este adjunto (servicio caído/sin saldo) — la keyword nunca se aprueba sin confirmación", () => {
    const result = ajustarClasificacionPorTriage(basePdf, undefined, clientNits);
    expect(result.isApprovedOC).toBe(false);
  });

  it("detección por NIT: la IA solo puede ELEVAR isApprovedOC, nunca degradarla", () => {
    const pdfNit = { client: "Hermeco", isDirigidoAEmpresa: false, isApprovedOC: false, detectionMethod: "nit" as const };
    const ia: TriageResult = { filename: "oc.pdf", tipo: "orden_compra", cliente: "Hermeco", razon: "NIT confirmado" };
    const result = ajustarClasificacionPorTriage(pdfNit, ia, clientNits);
    expect(result.isApprovedOC).toBe(true);
  });

  it("detección por NIT: sin triage IA disponible, el NIT es suficiente por sí solo (no se degrada)", () => {
    const pdfNit = { client: "Hermeco", isDirigidoAEmpresa: true, isApprovedOC: true, detectionMethod: "nit" as const };
    const result = ajustarClasificacionPorTriage(pdfNit, undefined, clientNits);
    expect(result).toEqual(pdfNit);
  });
});
