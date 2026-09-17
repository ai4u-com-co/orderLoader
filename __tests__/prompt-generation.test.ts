import { describe, it, expect } from "vitest";
import { buildMetaPrompt } from "@/lib/prompt-generation";

// ── TAMA-047 ──────────────────────────────────────────────────────────────────
//
// Causa raíz real (verificada contra producción, 2026-09-17): la OC de un cliente
// multi-tienda (ej. ÉXITO, Hermeco/OFFCORSS) trae 1 línea por tienda, mismo artículo,
// misma fecha de entrega general, distinguidas solo por una columna tipo "Dependencia
// de Entrega"/"Centro"/"Tienda". `validarSapB1Json` (step2-validate-parse.ts) SÍ sabe
// permitir esa repetición legítima cuando el FreeText de línea distingue el destino
// (ver __tests__/step2-validar.test.ts, caso Hermeco/OFFCORSS OC 4500416657) — el
// código de validación no tiene ningún bug.
//
// El hueco real está un paso antes: el META-prompt compartido (`buildMetaPrompt`,
// usado tanto para generar el prompt de un cliente nuevo como para regenerar uno
// existente) nunca le pide al modelo que busque esa columna de tienda/centro y la
// copie a FreeText — solo dice "verbatim descriptive text for this line, "" if none",
// sin ninguna pista de POR QUÉ importa ni de qué buscar. Por eso el prompt generado
// para ÉXITO nunca captura "Dependencia de Entrega" y todas sus líneas quedan con
// FreeText vacío → step2 las ve como "el mismo código repetido con la misma fecha"
// y rechaza la OC completa (confirmado en vivo: OC 4501537324/25/26/27/28 de ÉXITO,
// PDF real con 1 línea por "Dependencia de Entrega" — ej. "2035 ÉXITO ENVIGADO",
// "2033 ÉXITO POBLADO" — y prompt en `clientes_aprobados` sin ninguna mención de
// tienda/centro/FreeText, a diferencia del prompt de Hermeco que sí la tiene desde
// que se corrigió a mano para el caso OFFCORSS).
//
// Este test no llama al modelo (el meta-prompt es una plantilla estática): verifica
// que la plantilla instruya explícitamente detectar la columna de tienda/centro y
// mapearla a FreeText, para que CUALQUIER cliente nuevo o regenerado —no solo el que
// ya tuvo un incidente— quede protegido desde el primer prompt generado.

describe("buildMetaPrompt — detección de columna de tienda/centro para FreeText (TAMA-047)", () => {
  const prompt = buildMetaPrompt("Tamaprint", "CN", "Cliente de prueba");

  it("instruye buscar una columna de tienda/sucursal/centro de costo por línea", () => {
    const menciona = /tienda|sucursal|store|branch|centro de costo|cost.center/i.test(prompt);
    expect(menciona).toBe(true);
  });

  it("explica que esta columna sirve para distinguir líneas con el mismo artículo y fecha (pedidos multi-tienda)", () => {
    const explicaElPorque = /multi-?(tienda|store)/i.test(prompt) || /repite.*artículo|repeats.*product|misma fecha.*distintas tiendas|same date.*different store/i.test(prompt);
    expect(explicaElPorque).toBe(true);
  });

  it("sigue instruyendo el mapeo de FreeText como antes (no rompe la regla existente)", () => {
    expect(prompt).toMatch(/FreeText/);
  });
});
