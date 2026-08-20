/**
 * step0-download.ts deja a propósito los correos de notificación propios de
 * OrderLoader dentro del INBOX (nunca se archivan — ver "① Notificación propia
 * de OrderLoader → dejar en INBOX") y los re-lista en cada corrida como línea de
 * detalle "INBOX (notif OrderLoader): "<asunto>" de <remitente>". Esas líneas
 * solo ecoan el asunto histórico del correo, que puede traer "✗"/"⚠" porque ese
 * es el estado con el que se notificó en su momento — no una falla nueva de la
 * corrida actual.
 *
 * Bug real (Nightly Error Fixer, 2026-08-19/20): sin este corte, logStepResult()
 * reclasificaba esas líneas como log.error/log.warn por el simple hecho de
 * contener "✗"/"⚠" en el asunto citado, generando un cluster de falsos "X/Y
 * órdenes fallidas" que solo crecía con el tiempo (el INBOX nunca se vacía de
 * notificaciones propias, así que cada corrida hourly re-lista y re-clasifica
 * TODO el historial acumulado).
 */
import { describe, it, expect } from "vitest";
import { classifyDetailLine } from "@/lib/pipeline";

describe("classifyDetailLine", () => {
  it("nunca clasifica el eco de una notificación propia como error, aunque el asunto cite \"✗\"", () => {
    const line = 'INBOX (notif OrderLoader): "[OrderLoader/Tamaprint] ✗ Alta tasa de errores — 11/21 órdenes fallaron" de pedidos@tamaprint.com';
    expect(classifyDetailLine(line)).toBe("info");
  });

  it("nunca clasifica el eco de una notificación propia como warn, aunque el asunto cite \"⚠\"", () => {
    const line = 'INBOX (notif OrderLoader): "[OrderLoader/Tamaprint] OC 8654 | ICVO | ERROR_VALIDACION | ⚠ Contiene más documentos" de pedidos@tamaprint.com';
    expect(classifyDetailLine(line)).toBe("info");
  });

  it("una línea de error real (no eco de notificación) sigue clasificando como error", () => {
    expect(classifyDetailLine("✗ Respuesta vacía del modelo")).toBe("error");
  });

  it("una línea de warning real (no eco de notificación) sigue clasificando como warn", () => {
    expect(classifyDetailLine("⚠ OC 123 → ERROR_VALIDACION (2 diferencia(s)):")).toBe("warn");
  });

  it("una línea de recuperación (↩) sigue clasificando como warn", () => {
    expect(classifyDetailLine("↩ Comodin/archivo.pdf: reprocesando (registro DB eliminado)")).toBe("warn");
  });

  it("una línea informativa normal clasifica como info", () => {
    expect(classifyDetailLine("Revisando INBOX: 90 correo(s)")).toBe("info");
  });
});
