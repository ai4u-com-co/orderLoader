# Plan: código tenant-agnóstico (sin hardcoding de tenants)

> Objetivo: que el código no contenga **ninguna alusión** a `tamaprint` ni `flexoimpresos`.
> Toda la identidad y los datos del tenant deben venir de **configuración** (env vars + DB),
> nunca de constantes/ramas en el código.
>
> Restricción dura: **producción corre hoy con 2 tenants** (Tamaprint en VM, Flexo). Ningún
> paso puede romper un tenant en marcha. Por eso el refactor va por fases y los pasos que
> cambian "de dónde se lee la config" llevan **fallback temporal** hasta poblar los `.env`/DB.

---

## Dónde está hoy el hardcoding (inventario)

| # | Ubicación | Qué hay hardcodeado | Tipo |
|---|-----------|---------------------|------|
| 1 | `ai-triage.ts:74`, `step0:105` | `companyName = "Tamaprint"` (default de parámetro; en runtime siempre se pasa `config.tenantDisplayName`) | cosmético |
| 2 | `step0:7,759,873`, `schemas.ts:20` | comentarios con nombres de tenant/Sandra | cosmético |
| 3 | `config.ts:166-173` | `TENANT ?? "tamaprint"`, `TENANT_META` con `displayName`/`cardCodePrefix`/`receptorKeywords` por tenant | identidad |
| 4 | `pdf-classify.ts:10-24` | `TAMAPRINT_RECEPTOR_KEYWORDS`, `FLEXO_RECEPTOR_KEYWORDS` (palabras + NIT de la empresa receptora) | identidad |
| 5 | `pdf-classify.ts:34-77` | `CLIENT_NITS`, `CLIENT_TEXT_KEYWORDS` (clientes de Tamaprint: Comodin, Hermeco, …) | datos por tenant |
| 6 | `clientes-seed.ts`, `clientes-seed-flexo.ts`, `flexo-prompts-generated.ts` | seeds y prompts por tenant en código | datos por tenant |
| 7 | `migrate/route.ts:15-25` | `if (config.tenant === "flexoimpresos") …` para elegir seed/prompts | rama por tenant |
| 8 | `step2:76` | `["Hermeco","Comodin"].includes(_clienteNombre)` → regla "sin cero inicial" por cliente | regla por cliente |

Observación clave: el camino multitenant **ya existe a medias**. `clientes_aprobados` (DB) +
`loadClientListsFromDb()` ya son la fuente preferida; los `CLIENT_NITS`/seeds del código se usan
solo como **fallback / semilla inicial**. El trabajo es cortar ese cordón.

---

## Arquitectura objetivo

El código no conoce ningún tenant. Las fuentes de verdad pasan a ser:

- **Identidad del tenant → env vars** (`.env` por VM):
  - `TENANT` (string opaco, solo para etiquetar logs/correos; sin lista cerrada de valores)
  - `TENANT_DISPLAY_NAME`
  - `CARD_CODE_PREFIX`
  - `RECEPTOR_KEYWORDS` (lista separada por comas) ← **nuevo**
- **Datos de clientes (NIT, keywords, prompt, reglas) → tabla `clientes_aprobados`** (única fuente).
- **Semilla inicial de clientes → archivo de datos externo** montado por tenant
  (`$DATA_DIR/clientes-seed.json`), no `.ts` en el repo.

---

## Fase 1 — Limpieza cosmética (riesgo cero, comportamiento idéntico)

No cambia de dónde se lee nada; solo elimina nombres de tenant del código.

1. `ai-triage.ts` y `step0`: quitar el default `= "Tamaprint"` del parámetro `companyName`
   (hacerlo requerido, o default `""`). Runtime ya pasa `config.tenantDisplayName` siempre.
2. Reemplazar comentarios que nombran Tamaprint/Flexo/Sandra por texto genérico
   ("la empresa receptora", "la carpeta de revisión manual", etc.).
3. `schemas.ts:20`: comentario genérico sobre el `CardCode` (el regex ya es `startsWith("C")`).

**Precondición:** ninguna. **Deploy:** seguro, sin tocar `.env`. **Verificación:** `tsc` + `vitest` + `lint`.

---

## Fase 2 — Identidad del tenant a env vars (con fallback temporal)

Mueve `receptorKeywords` (y consolida `displayName`/`cardCodePrefix`) a `.env`, **sin** quitar de
golpe los valores actuales: durante la transición, si la env var falta, se usa el valor histórico.

### 2a. Código (con fallback)
- `config.ts`:
  - `receptorKeywords` ← `process.env.RECEPTOR_KEYWORDS?.split(",")` **|| fallback** a `TENANT_META`.
  - Mantener `TENANT_DISPLAY_NAME` / `CARD_CODE_PREFIX` (ya existen) como única vía recomendada.
  - ⚠️ **`TENANT` NO es solo una etiqueta**: el backend SAP centralizado rutea por
    `/api/v1/<tenant>/...` (`backend-client.ts`). Su **valor** y **default** no pueden cambiarse
    sin coordinar el backend. En 2c, antes de quitar el default `"tamaprint"`, cada VM debe setear
    `TENANT` explícitamente y verificarse que el backend acepta ese identificador.
- `pdf-classify.ts`: las constantes `*_RECEPTOR_KEYWORDS` quedan **solo como fallback** referenciado
  desde `config.ts`, marcadas como deprecadas; se eliminan en la limpieza final de la fase.

### 2b. Poblar `.env` de cada VM (lo hace Mariano, fuera del repo)
```
# VM Tamaprint (.env)
TENANT=tamaprint
TENANT_DISPLAY_NAME=Tamaprint
CARD_CODE_PREFIX=CN
RECEPTOR_KEYWORDS=tamaprint,tama print,900851655,9008516551,900.851.655

# VM Flexo (.env / .env.flexoimpresos)
TENANT=flexoimpresos
TENANT_DISPLAY_NAME=Flexo Impresos
CARD_CODE_PREFIX=C
RECEPTOR_KEYWORDS=flexo impresos,flexoimpresos,900528680,9005286800,900.528.680
```

### 2c. Quitar el fallback
Una vez verificado que ambos VMs traen las env vars (vía `/api/health` o un check de arranque),
se elimina `TENANT_META` y las constantes `*_RECEPTOR_KEYWORDS` del código.

**Riesgo:** medio. El fallback evita romper hasta el paso 2c. **Orden obligatorio:** 2a → 2b → 2c.
**Verificación entre 2b y 2c:** confirmar en logs/health que `receptorKeywords` no está vacío en cada VM.

---

## Fase 3 — Datos de clientes y reglas a la DB (refactor estructural)

Elimina del código todos los datos específicos de un tenant.

### 3a. Semilla de clientes desde archivo externo
- Nuevo: `seedClientesFromFile(db, path)` lee `$DATA_DIR/clientes-seed.json`
  (formato: `[{carpeta, nombre, nit_principal, nits, keywords, card_code, prompt, reglas}]`).
- `migrate/route.ts`: elimina la rama `if (tenant === "flexoimpresos")`; siempre siembra desde el
  archivo del tenant si la tabla está vacía. Sin import de `clientes-seed-flexo` ni `flexo-prompts-generated`.
- Se exportan los datos actuales a dos JSON (uno por VM) y se montan en `$DATA_DIR`.
- Se borran del repo: `clientes-seed.ts`, `clientes-seed-flexo.ts`, `flexo-prompts-generated.ts`,
  y `CLIENT_NITS`/`CLIENT_TEXT_KEYWORDS` de `pdf-classify.ts`.

### 3b. Quitar los fallbacks hardcodeados de detección
- `pdf-classify.ts`, `ai-triage.ts`, `step0`, `step1`: hoy usan `CLIENT_NITS`/`CLIENT_TEXT_KEYWORDS`
  como default de parámetro y fallback de `loadClientListsFromDb`. Tras 3a, la DB es la única fuente;
  si la DB está vacía se trata como "sin clientes configurados" (no fallback a datos de un tenant).

### 3c. Regla por cliente a la DB (`step2:76`)
- Añadir columna a `clientes_aprobados`, p. ej. `regla_sin_cero_inicial INTEGER DEFAULT 0`
  (o un JSON `reglas`). `validarSapB1Json` consulta esa propiedad del cliente en vez de
  `["Hermeco","Comodin"].includes(...)`.
- Migración versionada en `db.ts` + marcar la regla en los clientes que hoy la requieren.

**Riesgo:** alto (cambia la fuente de los datos de negocio). **Precondición:** la DB de cada VM debe
tener los clientes ya cargados (hoy lo están, vía seeds previos) **antes** de quitar el fallback.
**Estrategia:** exportar la DB actual de cada VM, validar que `clientes_aprobados` está completa,
y recién entonces aplicar 3b. Probar con PDFs reales de varios clientes por tenant.

---

## Orden de ejecución y despliegue recomendado

1. **Fase 1** → commit + deploy a ambos VMs. Observar 1 corrida. (sin riesgo)
2. **Fase 2a** (fallback) → deploy. **2b** poblar `.env`. Verificar health. **2c** quitar fallback → deploy.
3. **Fase 3a/3c** (seed externo + regla en DB) con la DB ya poblada → deploy a un VM primero,
   observar, luego el otro. **3b** (quitar fallbacks) al final.

Cada fase es un commit aislado para poder revertir solo esa fase sin perder lo demás.

---

## Checklist de "cero hardcoding" (criterio de done)

- [ ] `grep -riE "tamaprint|flexo" lib app components --include=*.ts --include=*.tsx` → 0 resultados.
- [ ] No quedan ramas `if (tenant === "...")` en el código.
- [ ] `config.ts` no importa nada de un tenant; toda identidad viene de env.
- [ ] `clientes_aprobados` (DB) es la única fuente de clientes/NITs/keywords/prompts/reglas.
- [ ] `tsc` + `vitest` + `lint` en verde; corrida real OK en ambos tenants.
