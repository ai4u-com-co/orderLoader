import { describe, it, expect } from "vitest";
import { extractResponseText } from "../lib/anthropic-content";
import type Anthropic from "@anthropic-ai/sdk";

// Regresión del incidente 2026-07-24→27: la migración a claude-sonnet-5 (commit
// bd7447e) activó thinking adaptativo por defecto, y la respuesta pasó de
// [text] a [thinking, text]. El código leía content[0] asumiendo texto →
// "Respuesta vacía del modelo" en el 100% de los parseos de ambos tenants.
describe("extractResponseText", () => {
  const text = (t: string) =>
    ({ type: "text", text: t, citations: null }) as Anthropic.ContentBlock;
  const thinking = (t: string) =>
    ({ type: "thinking", thinking: t, signature: "sig" }) as Anthropic.ContentBlock;

  it("extrae el texto cuando es el único bloque (shape Sonnet 4.6)", () => {
    expect(extractResponseText([text('{"ok":true}')])).toBe('{"ok":true}');
  });

  it("extrae el texto aunque venga precedido por un bloque thinking (shape Sonnet 5)", () => {
    expect(extractResponseText([thinking("razonando..."), text('{"ok":true}')])).toBe(
      '{"ok":true}',
    );
  });

  it("recorta espacios del texto", () => {
    expect(extractResponseText([thinking(""), text("  hola  ")])).toBe("hola");
  });

  it("devuelve vacío si no hay ningún bloque de texto", () => {
    expect(extractResponseText([thinking("solo pensó")])).toBe("");
    expect(extractResponseText([])).toBe("");
  });
});
