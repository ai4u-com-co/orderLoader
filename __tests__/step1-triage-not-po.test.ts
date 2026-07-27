/**
 * Regresión — incidente New Stetic 2026-07-27: el triage IA de step0 ya había
 * clasificado un comprobante de pago electrónico como "documento_relevante"
 * (no es una OC) con una razón concreta, pero step1 lo mandaba igual a
 * parseWithAI. El prompt de extracción de OC de ese cliente prohíbe al modelo
 * escribir cualquier texto que no sea el JSON — obligado a responder solo con
 * JSON pero sin datos de OC que extraer, el modelo forzó un JSON con campos
 * vacíos (NumAtCard:"", DocumentLines:[]) en vez de negarse con una frase de
 * rechazo, y el pedido terminó en "Error de validación AI" — un mensaje que no
 * explica lo que realmente pasó (no había ninguna OC en el documento).
 *
 * getTriageTipo() debe permitir a step1 evitar esa llamada por completo,
 * reusando la clasificación de step0.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { getTriageTipo } from "@/lib/steps/step1-parse";

let tmpDir: string;

describe("getTriageTipo", () => {
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-test-")); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it("devuelve la clasificación del triage cuando el PDF está marcado como documento_relevante", () => {
    fs.writeFileSync(path.join(tmpDir, "correo_metadata.json"), JSON.stringify({
      triage_ia: [
        {
          filename: "1_001PEL101500_.pdf",
          tipo: "documento_relevante",
          cliente: "NewStetic",
          razon: "Documento de pago electrónico de NewStetic, no es una orden de compra",
        },
      ],
    }));

    const result = getTriageTipo(tmpDir, "1_001PEL101500_.pdf");
    expect(result?.tipo).toBe("documento_relevante");
    expect(result?.razon).toContain("no es una orden de compra");
  });

  it("devuelve la entrada con tipo orden_compra sin filtrar (el filtro por tipo es responsabilidad del caller)", () => {
    fs.writeFileSync(path.join(tmpDir, "correo_metadata.json"), JSON.stringify({
      triage_ia: [{ filename: "oc.pdf", tipo: "orden_compra", cliente: "Comodin", razon: "" }],
    }));

    expect(getTriageTipo(tmpDir, "oc.pdf")?.tipo).toBe("orden_compra");
  });

  it("devuelve null si no hay correo_metadata.json (no bloquear el parseo por falta de metadata)", () => {
    expect(getTriageTipo(tmpDir, "cualquier.pdf")).toBeNull();
  });

  it("devuelve null si correo_metadata.json existe pero no tiene triage_ia", () => {
    fs.writeFileSync(path.join(tmpDir, "correo_metadata.json"), JSON.stringify({ client: "Comodin" }));
    expect(getTriageTipo(tmpDir, "oc.pdf")).toBeNull();
  });

  it("devuelve null si el correo_metadata.json está corrupto (no bloquear el pipeline)", () => {
    fs.writeFileSync(path.join(tmpDir, "correo_metadata.json"), "{ esto no es JSON válido");
    expect(getTriageTipo(tmpDir, "oc.pdf")).toBeNull();
  });
});
