/**
 * Wraps an Anthropic API call with exponential backoff for 529 (overloaded) errors.
 * Retries up to 4 times: 2s, 4s, 8s, 16s delays.
 */

import Anthropic from "@anthropic-ai/sdk";

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

function isOverloaded(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 529;
}

export async function withAnthropicRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (isOverloaded(err) && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[anthropic] Overloaded (529), reintentando en ${delay / 1000}s (intento ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(res => setTimeout(res, delay));
        attempt++;
      } else {
        throw err;
      }
    }
  }
}
