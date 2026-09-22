/**
 * SQLite guarda `datetime('now')` como texto UTC sin sufijo de zona, ej.
 * "2026-09-22 18:01:07". `new Date(...)` sobre ese string exacto (sin "T" ni "Z")
 * lo interpreta según el reloj del proceso — y este proceso corre con
 * `TZ=America/Bogota` (docker-compose.yml). Resultado real, verificado en
 * producción (2026-09-22): con la última corrida hace 31 minutos, `/api/health`
 * mostraba `hours_ago: -4.5` — un desfase de exactamente 5 horas, el offset de
 * Bogotá, porque el string se tomó como hora local en vez de UTC.
 *
 * Usar esta función en vez de `new Date(fila.ts)` para cualquier timestamp que
 * venga de `pipeline_log`/`pedidos_maestro` u otra columna con ese mismo formato.
 */
export function parseSqliteUtc(value: string): Date {
  // "2026-09-22 18:01:07" → "2026-09-22T18:01:07Z"
  const isoUtc = value.includes("T") ? value : value.replace(" ", "T");
  return new Date(isoUtc.endsWith("Z") ? isoUtc : `${isoUtc}Z`);
}
