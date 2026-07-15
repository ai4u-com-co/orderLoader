# OrderLoader 3.0 - Developer Guide

## Core Commands
- **Dev Server**: `npm run dev`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Tests**: `npm test`
- **Prod Mode (Docker)**: `docker compose up -d --build`
- **Manual Pipeline**: `curl -X POST http://localhost:3000/api/pipeline/run` (el cron del VM lo dispara igual)
- **Calculate AI Costs**: `npx tsx scripts/calculate-costs.ts`

## Coding Standards
- **Framework**: Next.js 15+ (App Router)
- **Database**: SQLite with `better-sqlite3`.
- **Logic**: Sequential pipeline in `lib/steps`.
- **Naming**: Spanish for business logic (pedidos, maestro, detalle), English for technical components.

## Multi-Tenant
El sistema corre como **instancias separadas por cliente**, una por VM/container. La variable `TENANT` controla el comportamiento.

| Cliente | `TENANT` | Email | Env file |
|---|---|---|---|
| TamaPrint | `tamaprint` (default) | IMAP / one.com | `.env` |
| FlexoImpresos | `flexoimpresos` | Microsoft Graph (Office 365) | `.env.flexoimpresos` |

Para deployar FlexoImpresos, copiar `.env.flexoimpresos` como `.env` en la VM correspondiente antes de correr el build.

No hay `tenant_id` en la BD — cada instancia tiene su propia base de datos aislada en `.data/`.

## Deploy
Siempre que termines de hacer cambios, ejecuta el deploy en Docker:
```bash
docker compose up -d --build
```

## Desarrollo Local
Antes de probar cambios, sincroniza la BD desde la VM:
```bash
npm run pull-db
```
Configura `VM_HOST=user@ip` y opcionalmente `VM_PATH=~/ruta/.data` en `.env.local` (no se commitea).

**IMPORTANTE:** Nunca correr step 0 localmente — en cualquier tenant conecta al inbox real de producción (IMAP o Microsoft Graph) y puede descargar correos activos.

## Acceso al dashboard
El dashboard NO tiene autenticación: opera abierto en el VM (sin passwords). El gate
de auth (`proxy.ts` / `CRON_SECRET`) fue removido — OrderLoader corre directo en el VM
para Tamaprint sin login.

## Rotación de Secrets

### ANTHROPIC_API_KEY
Rotar en https://console.anthropic.com/ → API Keys. Actualizar `.env` y redeploy.

### SAP (gateway centralizado)
OrderLoader ya no tiene credenciales SAP crudas — habla con `sap-b1-backend` vía
`SAP_BACKEND_URL` + `SAP_BACKEND_API_KEY`. Para rotar la API key del tenant: usar el
mecanismo `{TENANT}_API_KEY_2` en el proyecto Vercel de sap-b1-backend (poner el valor
nuevo en `_2`, actualizar este `.env`, recrear el contenedor con `--force-recreate` —
un `docker restart` NO recarga el env_file — y después retirar el valor viejo).

## Troubleshooting
- **Pipeline Logs**: `docker logs orderloader -f`
- **DB Backups**: Found in `.data/pedidos/backups/`.
- **Runbook completo**: Ver `docs/runbook.md`

## Versionado — obligatorio antes de cada commit

OrderLoader usa su **propio cliente** en el changelog-service (no el de tamaprint),
porque tiene API key y script de publicación dedicados.

```bash
# Publica desde la VM / local con el script ya configurado:
npm run publish:changelog
```

Variables (en `.env`): `CHANGELOG_URL`, `CHANGELOG_CLIENT_ID=orderloader`,
`CHANGELOG_APP_ID=web`, `CHANGELOG_API_KEY=clk_...`.

La UI lee el changelog vía `/api/changelog` (proxy server-side) y lo muestra en `/changelog`.
Bump la versión en `package.json` y registra los cambios con `publish:changelog` antes de cada deploy.
