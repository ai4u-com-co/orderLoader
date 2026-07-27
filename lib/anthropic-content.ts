import type Anthropic from "@anthropic-ai/sdk";

/**
 * Texto de la respuesta del modelo: el primer bloque `text` del content array.
 *
 * Los modelos con thinking adaptativo activado por defecto (claude-sonnet-5+)
 * pueden anteponer bloques `thinking` al texto, así que content[0] no siempre
 * es el bloque de texto — hay que buscarlo.
 */
export function extractResponseText(content: Anthropic.ContentBlock[]): string {
  const block = content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : "";
}
