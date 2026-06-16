/**
 * Wraps an Anthropic API call with exponential backoff for transient errors.
 * Retries up to 4 times (2s, 4s, 8s, 16s) on:
 *   - 529 (overloaded)
 *   - 429 (rate limit)
 *   - 5xx (errores transitorios del servidor)
 */

import Anthropic from "@anthropic-ai/sdk";

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2000;

/** True para errores transitorios que vale la pena reintentar. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Anthropic.APIError)) return false;
  const status = err.status ?? 0;
  return status === 429 || status === 529 || (status >= 500 && status < 600);
}

export async function withAnthropicRetry<T>(fn: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (isRetryable(err) && attempt < MAX_RETRIES) {
        const status = err instanceof Anthropic.APIError ? err.status : "?";
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[anthropic] Error transitorio (${status}), reintentando en ${delay / 1000}s (intento ${attempt + 1}/${MAX_RETRIES})...`);
        await new Promise(res => setTimeout(res, delay));
        attempt++;
      } else {
        throw err;
      }
    }
  }
}
