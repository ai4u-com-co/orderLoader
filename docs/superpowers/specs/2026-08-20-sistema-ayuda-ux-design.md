# Sistema de ayuda contextual + fricciones de UX — OrderLoader

## Contexto

OrderLoader es un dashboard interno (equipo administrativo de Tamaprint/Flexoimpresos)
que monitorea el pipeline Email → SAP B1. Hoy varios conceptos del dominio (estados del
pedido, "Fase", "Triggers", campos SAP del cliente) se muestran sin ninguna explicación,
y algunos errores técnicos crudos (`String(e)`) llegan tal cual a la pantalla. El objetivo
es agregar ayuda contextual puntual y resolver las fricciones de UX detectadas, sin
rediseñar ninguna pantalla.

Alcance aprobado por Mariano: sistema de ayuda + fricciones rápidas (`String(e)`, títulos
en inglés) + comportamiento (modal de confirmación, advertencia antes de correr el
pipeline real).

## Componentes nuevos (design system local del repo, patrón `cva` + tokens, igual que `Badge.tsx`)

### `design-system/atoms/InfoTooltip.tsx`
Ícono "?" (14px, círculo con borde `cadet-gray`). Hover en desktop / tap en mobile
muestra un popover con texto plano, posicionado con Tailwind (`absolute`, sin librería
externa). Prop única de contenido: `text: string`. Se usa solo donde no hay ya un dato
inline que explique el campo (ver tabla de aplicación más abajo).

### `design-system/molecules/ConfirmModal.tsx`
Modal de confirmación genérico: `title`, `message`, `confirmLabel`, `variant`
(`"danger"` | `"warning"`), `onConfirm`, `onCancel`. Reemplaza `confirm()`/`alert()`
nativos. Dos usos: borrar pedidos (danger) y advertencia antes de correr el pipeline
real (warning).

Ambos se exportan desde `design-system/index.ts`.

## `lib/help-content.ts` (nuevo)

Diccionario central de textos de ayuda, en español, tono interno (no el tono de cliente
que usa `step6-templates.ts` para los emails). Fuente de verdad de los estados: importa
`OrderStatus`/`OrderStatusValue` de `lib/constants.ts` — no duplica la lista de estados.

Contenido (texto corto, 1-2 líneas, basado en el significado real confirmado contra
`lib/steps/*.ts`, no inventado):

| Estado | Texto |
|---|---|
| NUEVO | Pedido detectado, todavía no se empezó a procesar. |
| PARSED | La IA ya extrajo los datos del PDF a JSON. |
| PARSE_VALIDO | La extracción pasó las validaciones básicas de formato y campos. |
| CATALOG_OK | Las referencias del pedido ya se resolvieron contra el catálogo SAP del cliente. |
| SAP_NUEVO | Nombre anterior de "Catálogo OK" — pedidos procesados antes del cambio. |
| SAP_MONTADO | El pedido ya se subió a SAP como orden de compra. |
| VALIDADO | Se comparó lo subido a SAP contra el PDF original y coincide. |
| NOTIFICANDO | Se está por enviar la notificación por correo del resultado. |
| NOTIFICADO | La notificación por correo ya se envió. |
| CERRADO | El pedido completó todo el ciclo. No requiere ninguna acción. |
| ERROR_PARSE | La IA no pudo extraer los datos del PDF. Revisar que el archivo no esté protegido o sea legible. |
| ERROR_DUPLICADO | Ya existe un pedido con este número de orden de compra en SAP. |
| ERROR_CATALOG | Uno o más artículos no están homologados en el catálogo SAP del cliente. Hay que registrar la equivalencia en SAP y reintentar. |
| ERROR_ITEMS | El documento no tiene líneas de artículos válidas. Revisar el PDF original. |
| ERROR_SAP | SAP rechazó la operación (documento/socio/artículo con problema, o error de conexión). |
| ERROR_VALIDACION | Se subió a SAP pero hay diferencias de precio o cantidad contra el PDF. Requiere revisión manual. |
| ERROR_REVISION_MANUAL | El correo no tenía un PDF de pedido reconocible. Se movió a la carpeta de revisión manual. |

Más: `TRIGGERS_HELP`, `CLIENTE_CARPETA_HELP`, `CLIENTE_CARDCODE_HELP`,
`ERROR_GENERICO_FALLBACK` (mensaje amigable para reemplazar `String(e)` cuando no hay
un mensaje de error más específico disponible).

## Bug encontrado durante el diseño (no era parte del pedido original, pero está en el
## mismo lugar que vamos a tocar)

`components/PipelineStatus.tsx` (`STATUS_MAP`) está desincronizado del enum real
`OrderStatus` en `lib/constants.ts`: le faltan `CATALOG_OK`, `NOTIFICANDO`, `NOTIFICADO`,
`ERROR_CATALOG` — hoy esos 4 estados caen al fallback y se muestran con el código crudo
sin traducir. Se corrige como parte de este trabajo (agregar las 4 entradas faltantes),
ya que estamos tocando ese archivo para agregar los tooltips.

## Aplicación por archivo

- **`components/PipelineStatus.tsx`**: agrega las 4 entradas faltantes al `STATUS_MAP`;
  cada `Badge` se envuelve con `InfoTooltip` usando el texto de `help-content.ts`.
- **`components/PedidoTable.tsx`**: (a) los botones de filtro de estado usan
  `STATUS_MAP[e]?.label ?? e` en vez del código crudo (línea ~207) — arregla la
  inconsistencia con el badge de la fila; (b) `handleDelete` reemplaza `confirm()`
  (línea 127) por `ConfirmModal` variant `"danger"`.
- **`components/PedidoDetail.tsx`**: (a) `setRetryError(String(e))` (línea 123) pasa por
  un helper `friendlyError(e)` con fallback a `ERROR_GENERICO_FALLBACK`; (b) el log de
  historial ya trae `fase_nombre` en el tipo `LogEntry` pero no se muestra — se agrega
  como `title` nativo HTML sobre `f{l.fase}` (no hace falta `InfoTooltip`, el dato ya
  existe inline, solo faltaba exponerlo).
- **`components/RunPipelineButton.tsx`**: (a) `handleRun` abre `ConfirmModal` variant
  `"warning"` ("Vas a correr el pipeline real: se van a descargar los correos nuevos del
  inbox y subir pedidos a SAP. ¿Continuar?") antes de disparar el `fetch`; solo al
  confirmar se ejecuta la lógica actual; (b) `setError(String(e))` (línea 159) pasa por
  el mismo `friendlyError(e)`.
- **`app/page.tsx`**: (a) `setError(String(e))` (línea 41) → `friendlyError(e)`; (b) el
  `alert()` de `handleDelete` (línea 57) se reemplaza por un mensaje inline (mismo patrón
  de bloque de error que ya usa la pantalla en línea 142, no un `alert()` nativo);
  (c) título "SAP B1 Order Pipeline" (línea 86) → "Automatización de Pedidos SAP B1".
- **`app/audit/page.tsx`**: (a) `setError(String(e))` (línea 73) → `friendlyError(e)`;
  (b) tab "Triggers" (línea 143) con `InfoTooltip` usando `TRIGGERS_HELP`; (c) título
  "Audit Trail — Pipeline" (línea 95) → "Registro de Auditoría — Pipeline"; (d) los 3
  colores hardcodeados de Tailwind (`ESTADO_STYLES` líneas 36-40, y el estado
  "iniciado"/otro de Triggers líneas 210-214) se reemplazan por los tokens reales del
  design system (`moderate-blue`/`hot-orange`/amarillo del token set, vía `cn()`) — sin
  reestructurar la tabla completa a componentes `Card`/`Badge`, eso sería scope creep.
- **`app/clientes/[id]/page.tsx`**: `InfoTooltip` en las etiquetas "Carpeta (ID)" y
  "CardCode SAP" (los otros campos — Keywords, Prompt — ya tienen texto explicativo
  inline, no se tocan).
- **`app/clientes/page.tsx`**: `setError(String(e))` en `fetchClientes` → `friendlyError(e)`.

Un helper único `friendlyError(e: unknown): string` vive en `lib/help-content.ts` junto
al resto del contenido de ayuda (no en un archivo aparte) — intenta extraer un mensaje
legible de `Error`/`fetch` fallido, y si no puede, devuelve `ERROR_GENERICO_FALLBACK`
("Ocurrió un error inesperado. Si el problema persiste, avisá al equipo técnico.").
No oculta el detalle: si `e` es un `Error` con mensaje, ese mensaje se muestra (ya son en
general razonablemente legibles — "Sin stream", errores de red); solo cuando no hay nada
usable cae al fallback genérico.

## Fuera de alcance (explícitamente, para no expandir el pedido)

- No se toca `PedidoDetail.tsx` línea 279 (`l.mensaje`, log crudo del pipeline) — es un
  historial técnico dentro de un drawer de detalle, para el mismo equipo que ya opera el
  sistema; no es la clase de "ayuda conceptual" que pidió Mariano.
- No se reestructura `app/audit/page.tsx` a componentes `Card`/`Badge`/`Text` del design
  system — sólo se corrigen los colores hardcodeados que generan inconsistencia visual.
- No se agrega una suite de tests de UI nueva — el repo no tiene convención de testing de
  componentes (`vitest` solo cubre `lib/`). Verificación: type-check + build + navegador real.

## Testing / verificación

- `npx tsc --noEmit` y `npm run build` limpios.
- Verificación visual real en navegador (claude-in-chrome) de: tooltip de estado, tooltip
  de "Triggers", tooltips de Carpeta/CardCode, modal de confirmación al borrar pedidos,
  modal de advertencia al correr el pipeline (cancelar sin ejecutar, confirmar si es
  seguro hacerlo contra el entorno de prueba).
- No se ejecuta el pipeline real (step0 real) durante la verificación, según la regla
  existente del `CLAUDE.md` del repo ("Nunca correr step 0 localmente").
