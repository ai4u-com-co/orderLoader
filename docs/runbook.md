# OrderLoader — Runbook de Operaciones

Guía de respuesta rápida para los fallos más frecuentes en producción.

---

## 1. SAP auth timeout / credenciales rechazadas

**Síntoma:** Logs muestran `SAP login failed` o `401 Unauthorized`. Pedidos quedan en `PARSE_VALIDO` sin avanzar.

**Diagnóstico:**
```bash
# Verificar conectividad SAP desde la VM
curl http://localhost:3000/api/health?check_sap=true

# Ver logs recientes
docker logs orderloader --tail=50 | grep -i sap
```

**Solución:**
1. Verificar que `SAP_BACKEND_URL` y `SAP_BACKEND_API_KEY` en `.env` son correctos (la API key debe coincidir con `{TENANT}_API_KEY` o `{TENANT}_API_KEY_2` en el proyecto Vercel de sap-b1-backend)
2. Verificar que el gateway está arriba: `curl -s -o /dev/null -w "%{http_code}" https://sap-b1-backend.vercel.app/` (esperado 200)
3. Si la API key cambió: actualizar `.env` y recrear el contenedor con `docker compose up -d --force-recreate` (un `docker restart` NO recarga el env_file)
4. Si el gateway devuelve 502/504, el problema es entre el gateway y SAP — revisar logs del proyecto sap-b1-backend en Vercel

---

## 2. IMAP connection loss / bandeja no accesible

**Síntoma:** Logs `IMAP connection failed` o `Mailbox not found`. Step 0 termina con 0 procesados.

**Diagnóstico:**
```bash
docker logs orderloader --tail=30 | grep -i imap
curl http://localhost:3000/api/health
```

**Solución:**
1. Verificar credenciales IMAP: `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` en `.env`
2. Para FlexoImpresos (Microsoft Graph): verificar que `MS_CLIENT_SECRET` no expiró en portal.azure.com
3. Reiniciar el contenedor: `docker compose restart orderloader`
4. Si persiste: verificar firewall de la VM permite salida al puerto `EMAIL_PORT` (993/IMAP)

---

## 3. Pipeline stuck / no avanza entre corridas

**Síntoma:** `isPipelineRunning()` devuelve `true` pero no hay actividad en logs. La UI muestra "Pipeline en ejecución".

**Diagnóstico:**
```bash
# Verificar estado
curl -u cualquiera:$CRON_SECRET http://localhost:3000/api/pipeline/run

# Ver si el proceso está colgado
docker logs orderloader --tail=100 | grep "pipeline start\|pipeline done"
```

**Solución:**
```bash
# Reiniciar el contenedor (limpia el lock en memoria)
docker compose restart orderloader

# Si hay correos en estado intermedio en DB, resetear manualmente:
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "UPDATE pedidos_maestro SET estado='PARSE_VALIDO' WHERE estado='PARSED' AND ts_parsed < datetime('now', '-2 hours');"
```

---

## 4. Orden en ERROR_SAP permanente

**Síntoma:** Pedido lleva múltiples corridas en `ERROR_SAP`. El cliente pregunta por su pedido.

**Diagnóstico:**
```bash
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "SELECT orden_compra, cliente_nombre, error_msg, ts_sap_upload FROM pedidos_maestro WHERE estado='ERROR_SAP';"
```

**Causas frecuentes y solución:**
| Error SAP | Causa | Solución |
|---|---|---|
| `Business partner not found` | CardCode inválido | Verificar NIT en SAP → corregir en BD de clientes |
| `Item not found` | SKU no existe | Crear item en SAP o excluirlo del pedido |
| `Price list not assigned` | Cliente sin lista de precios | Configurar en SAP → CardCode → General |
| `Document date in closed period` | TaxDate en período cerrado | Actualizar TaxDate a fecha actual en `data_extraida.json` |

**Reintentar pedido:**
```bash
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "UPDATE pedidos_maestro SET estado='CATALOG_OK', error_msg=NULL WHERE orden_compra='OC-XXXX';"

# Luego disparar el pipeline manualmente desde step 4
curl -X POST -u cualquiera:$CRON_SECRET http://localhost:3000/api/pipeline/run \
  -H "Content-Type: application/json" -d '{"fromStep": 4, "toStep": 4}'
```

---

## 5. Backup corrupto / restaurar desde backup anterior

**Síntoma:** Error al iniciar `orderloader.db is not a database` o datos inconsistentes.

**Diagnóstico:**
```bash
docker exec -it orderloader sqlite3 /app/.data/orderloader.db "PRAGMA integrity_check;"
ls -la /app/.data/pedidos/backups/
```

**Restaurar backup:**
```bash
# Listar backups disponibles (más reciente primero)
ls -lt /app/.data/pedidos/backups/orderloader_*.db | head -5

# Parar el contenedor
docker compose stop orderloader

# Restaurar (reemplazar con el nombre de backup deseado)
cp /app/.data/pedidos/backups/orderloader_2025-01-15_10-30-00.db /app/.data/orderloader.db

# Verificar integridad del backup restaurado
sqlite3 /app/.data/orderloader.db "PRAGMA integrity_check; SELECT COUNT(*) FROM pedidos_maestro;"

# Reiniciar
docker compose start orderloader
```

---

## 6. Health check POST-deploy falla / rollback automático

**Síntoma:** El CI reporta "Health check falló. Haciendo rollback" en el job de deploy.

**Diagnóstico:**
```bash
# Ver logs del contenedor durante el deploy
docker logs orderloader --tail=50

# Verificar manualmente
curl http://localhost:3000/api/health
```

**Si el rollback también falla:**
```bash
# Restaurar manualmente al commit anterior
cd ~/orderLoader
git log --oneline -5          # identificar commit estable
git checkout <COMMIT_SHA>
docker compose up -d --build
```

---

## Comandos de consulta útiles

```bash
# Pedidos con error hoy
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "SELECT orden_compra, estado, error_msg FROM pedidos_maestro WHERE estado LIKE 'ERROR_%' AND fecha_recepcion > date('now', '-1 day');"

# Resumen de estados
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "SELECT estado, COUNT(*) as total FROM pedidos_maestro GROUP BY estado ORDER BY total DESC;"

# Últimos triggers del pipeline
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "SELECT ts, ip, resultado FROM pipeline_triggers ORDER BY id DESC LIMIT 10;"

# Costo IA del último mes
docker exec -it orderloader sqlite3 /app/.data/orderloader.db \
  "SELECT ROUND(SUM(costo_ia_usd), 4) as total_usd FROM pedidos_maestro WHERE fecha_recepcion > date('now', '-30 days');"
```
