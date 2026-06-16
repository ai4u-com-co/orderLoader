import { describe, it, expect } from "vitest";
import { detectClientFromPdf } from "@/lib/pdf-classify";

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
