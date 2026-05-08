# Guía: CLI de Meta Ads desde la terminal (paso a paso, en español)

Esta guía deja funcionando el CLI [`meta-ads`](https://pypi.org/project/meta-ads/) en tu máquina para que puedas listar campañas, sacar insights, crear ads y consultar la API de Marketing de Meta sin tocar el dashboard.

Funciona en macOS y Linux. En Windows, usar WSL.

---

## 0. ¿Qué vas a tener al final?

Un comando `meta` en tu terminal que habla con Meta Marketing API. Por ejemplo:

```bash
meta auth status
meta ads campaign list
meta ads insights get --date-preset last_7d -o json
meta ads adset list 12345678901234567
```

---

## 1. Requisitos previos

Necesitas tres cosas:

1. **Acceso de admin a un Business Manager** (Meta Business Suite) con un Ad Account asociado. Si tu amigo es el dueño de la cuenta, ya está. Si no, que lo añadan como admin.
2. **`uv` instalado** — un gestor de Python moderno y rápido. Es la forma más limpia de instalar herramientas Python aisladas.
3. **Una terminal** (Terminal.app en Mac, o cualquiera en Linux).

### Instalar `uv` si no lo tienes

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Cierra y reabre la terminal. Verifica:

```bash
uv --version
```

Debería decir algo como `uv 0.11.x`.

---

## 2. Instalar el CLI `meta-ads`

```bash
uv tool install meta-ads
```

Esto:
- Crea un entorno Python aislado para la herramienta.
- Pone el binario `meta` en `~/.local/bin/meta`.
- No ensucia tu Python del sistema.

Verifica:

```bash
meta --version
meta --help
```

Si dice "command not found", agrega `~/.local/bin` al PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc   # o ~/.bashrc en Linux
source ~/.zshrc
```

---

## 3. Obtener las 3 credenciales de Meta

El CLI necesita **tres datos** del Business Manager de Meta:

| Variable | Qué es | Dónde se saca |
|---|---|---|
| `ACCESS_TOKEN` | Token de un System User con permisos sobre el ad account | Business Settings → Users → System Users |
| `AD_ACCOUNT_ID` | ID de la cuenta publicitaria (formato `act_NNNNNNNNNN`) | Ads Manager → selector arriba a la izquierda |
| `BUSINESS_ID` | ID del Business Manager (numérico) | Business Settings → URL del navegador (`?business_id=…`) |

### 3.1 Crear un System User y su token

Esta es la parte que **siempre** confunde la primera vez. Hacer System User en lugar de usar el token personal de Facebook — los personales caducan, los de System User no.

1. Entra a [business.facebook.com/settings](https://business.facebook.com/settings).
2. **Users → System Users** (barra lateral izquierda).
3. Click en **Add** → ponle un nombre (ej. `cli-token`) → rol **Admin** → Create.
4. Selecciónalo en la lista y click **Add Assets**:
   - **Ad accounts** → selecciona la cuenta → permisos: **Manage Ad Account** → Save.
   - **Pages** (opcional, si vas a usar `meta ads page` o crear ads orgánicos): selecciona la página → permisos completos → Save.
5. Con el System User seleccionado, click **Generate New Token**.
   - Selecciona la app (si no tienes una, créala en [developers.facebook.com](https://developers.facebook.com) — tipo "Business").
   - **Token expiration:** Never.
   - **Permisos** (scopes) — marca al menos:
     - `ads_read`
     - `ads_management`
     - `business_management`
     - `read_insights`
     - `pages_read_engagement` (si manejas páginas)
   - Click **Generate Token**.
6. **Cópialo ya.** Solo se ve una vez. Si lo pierdes, hay que generar otro.

Eso es tu `ACCESS_TOKEN`.

### 3.2 Sacar el `AD_ACCOUNT_ID`

1. Entra a [adsmanager.facebook.com](https://adsmanager.facebook.com).
2. Arriba a la izquierda, selector de cuentas. El número que aparece es el ID.
3. **Importante:** el formato es `act_` + el número. Si ves `123456789`, escríbelo como `act_123456789`.

### 3.3 Sacar el `BUSINESS_ID`

1. Entra a [business.facebook.com/settings](https://business.facebook.com/settings).
2. Mira la URL del navegador. Verás algo como:
   ```
   https://business.facebook.com/settings/info?business_id=987654321098765
   ```
3. Ese número (`987654321098765`) es tu `BUSINESS_ID`.

---

## 4. Configurar variables de entorno

El CLI lee tres variables de entorno: `ACCESS_TOKEN`, `AD_ACCOUNT_ID`, `BUSINESS_ID`.

### Opción A — para una sola cuenta (lo más simple)

Edita tu `~/.zshrc` (o `~/.bashrc` en Linux) y añade al final:

```bash
export ACCESS_TOKEN="EAAB...tu-token-largo"
export AD_ACCOUNT_ID="act_123456789"
export BUSINESS_ID="987654321098765"
```

Recarga:

```bash
source ~/.zshrc
```

Verifica que el CLI te reconoce:

```bash
meta auth status
```

Si todo va bien, te muestra a quién pertenece el token y qué permisos tiene.

### Opción B — para varias cuentas/clientes

Si manejas más de una cuenta de Meta, no metas los tokens en el shell global. Usa un archivo `.env` por cliente y un wrapper que cargue el correcto.

**Crea `~/meta-envs/cliente1.env`** (no lo subas a git):

```bash
ACCESS_TOKEN=EAAB...token-cliente1
AD_ACCOUNT_ID=act_111111111
BUSINESS_ID=222222222222222
```

**Crea `~/meta-envs/cliente2.env`** con los datos del otro cliente.

**Crea un script wrapper** `~/bin/metac` (mete `~/bin` al PATH):

```bash
#!/bin/bash
# Uso: metac --client=cliente1 ads campaign list
set -e

CLIENT=""
ARGS=()
for arg in "$@"; do
  case "$arg" in
    --client=*) CLIENT="${arg#--client=}" ;;
    *) ARGS+=("$arg") ;;
  esac
done

if [ -z "$CLIENT" ]; then
  echo "Error: --client=<id> requerido" >&2
  exit 1
fi

ENV_FILE="$HOME/meta-envs/${CLIENT}.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: no existe $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

exec meta "${ARGS[@]}"
```

Hazlo ejecutable:

```bash
chmod +x ~/bin/metac
```

Ahora puedes hacer:

```bash
metac --client=cliente1 ads campaign list
metac --client=cliente2 auth status
```

Esto evita el riesgo de ejecutar un comando contra la cuenta equivocada.

---

## 5. Comandos útiles

### Verificar autenticación

```bash
meta auth status
```

### Listar campañas

```bash
meta ads campaign list                    # tabla legible
meta ads campaign list -o json            # JSON crudo
meta ads campaign get 123456789012345     # detalle de una
```

### Listar ad sets y ads

```bash
meta ads adset list                       # todos los del ad account
meta ads adset list 123456789012345       # solo los de una campaña
meta ads ad list 234567890123456          # ads de un ad set específico
```

### Insights (rendimiento)

```bash
# Últimos 7 días, métricas por defecto (spend, impressions, clicks, ctr, cpc, reach)
meta ads insights get --date-preset last_7d

# Por campaña, con métricas específicas
meta ads insights get \
  --date-preset last_30d \
  --fields spend,impressions,clicks,ctr,cpc,actions,action_values \
  --time-increment daily \
  --campaign-id 123456789012345 \
  -o json

# Breakdown por plataforma (Facebook vs Instagram)
meta ads insights get \
  --date-preset last_7d \
  --breakdown publisher_platform

# Rango de fechas custom
meta ads insights get --since 2026-04-01 --until 2026-04-30
```

Date presets disponibles: `today`, `yesterday`, `last_3d`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `this_month`, `last_month`.

### Crear una campaña

```bash
meta ads campaign create \
  --name "Test Campaign" \
  --objective OUTCOME_SALES \
  --daily-budget 5000      # en centavos = $50/día
```

### Crear un ad set y un ad

Usa `meta ads adset create --help` y `meta ads ad create --help` para ver todos los flags. Hay muchos (targeting, optimization goal, billing event, etc.).

### Ver TODA la ayuda

```bash
meta --help
meta ads --help
meta ads campaign --help
meta ads insights get --help
```

Cada subcomando tiene su `--help`.

---

## 6. Trucos y tips

### Formato de salida

```bash
-o table     # legible (default)
-o json      # para procesar con jq
-o plain     # plano, ideal para pipes
```

Combinado con `jq` queda muy potente:

```bash
meta ads campaign list -o json | jq '.[] | {id, name, status, daily_budget}'
```

### Modo debug

Si algo falla y no entiendes por qué:

```bash
meta --debug ads insights get --date-preset last_7d
```

Imprime la request HTTP y la respuesta completa.

### Sin colores (para logs)

```bash
meta --no-color ads campaign list
```

### Sin prompts interactivos (para scripts)

```bash
meta --no-input ads campaign create --name X --objective OUTCOME_SALES --daily-budget 5000
```

---

## 7. Errores comunes

**`Invalid OAuth access token`**
→ El token expiró, está mal copiado, o no tiene permisos sobre ese ad account. Genera uno nuevo en Business Settings → System Users.

**`Unsupported get request` / `(#100) Tried accessing nonexisting field`**
→ Casi siempre es que `AD_ACCOUNT_ID` no incluye el prefijo `act_`. Debe ser `act_123456789`, no `123456789`.

**`Permissions error` al crear/editar**
→ Tu System User no tiene `Manage Ad Account`. Vuelve a Business Settings → System Users → tu usuario → Add Assets → Ad Accounts → activa el toggle de **Manage Ad Account**.

**`command not found: meta`**
→ Falta `~/.local/bin` en el PATH. Ver paso 2.

**Token "personal" en vez de System User**
→ Sí funciona unas semanas, después caduca y rompe todos tus scripts. Siempre usa System User para automatización.

---

## 8. Seguridad

- **Nunca** subas `.env` con el token a GitHub. Pon `.env*` en `.gitignore`.
- El token de System User da acceso completo al ad account. Trátalo como una contraseña.
- Si se filtra: Business Settings → System Users → tu usuario → **Reset Token**. El viejo deja de funcionar al instante.
- Si vas a usar el token desde un servidor (Cloudflare, Vercel, etc.), guárdalo como secret de la plataforma, no como variable hardcodeada.

---

## 9. Documentación oficial

- CLI: <https://pypi.org/project/meta-ads/>
- Marketing API: <https://developers.facebook.com/docs/marketing-apis/>
- Insights API (métricas): <https://developers.facebook.com/docs/marketing-api/insights>
- Business Settings: <https://business.facebook.com/settings>

---

¿Algo no funciona? El 90% de los problemas son: (a) el `act_` faltante en el ID, (b) el token sin permisos suficientes, o (c) el token de System User no asignado al ad account. En ese orden.
