import { describe, it, expect } from "vitest";
import { parseSqliteUtc } from "@/lib/dates";

// Regresión — bug real encontrado en producción (2026-09-22): /api/health mostraba
// "hours_ago": -4.5 con la última corrida hace apenas 31 minutos. `new Date(...)` sobre
// un timestamp de SQLite ("2026-09-22 18:01:07", UTC sin sufijo) lo interpretaba con la
// zona del proceso (TZ=America/Bogota en docker-compose.yml) en vez de UTC, adelantando
// el epoch 5 horas — exactamente el offset de Bogotá.
describe("parseSqliteUtc", () => {
  it("interpreta el string de SQLite como UTC, no como hora local del proceso", () => {
    const d = parseSqliteUtc("2026-09-22 18:01:07");
    expect(d.toISOString()).toBe("2026-09-22T18:01:07.000Z");
  });

  it("calcula horas transcurridas correctas contra un 'ahora' real, sin desfase", () => {
    const last = parseSqliteUtc("2026-09-22 18:01:07");
    const now = new Date("2026-09-22T18:32:08.000Z"); // ~31 min después, medido en vivo
    const hoursAgo = (now.getTime() - last.getTime()) / 3_600_000;
    expect(hoursAgo).toBeGreaterThan(0);
    expect(hoursAgo).toBeCloseTo(0.52, 1);
  });

  it("acepta también un string que ya viene en formato ISO con Z", () => {
    expect(parseSqliteUtc("2026-09-22T18:01:07Z").toISOString()).toBe("2026-09-22T18:01:07.000Z");
  });
});
