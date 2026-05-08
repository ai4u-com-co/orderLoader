# Costo Real de la Digitación Manual de Pedidos

> Análisis de tiempo y costo laboral para empresas con SAP B1  
> Referencia para argumentación comercial y cálculo de ROI de OrderLoader

---

## Desglose por Etapas del Proceso Manual

| # | Etapa | Tiempo estimado | Notas |
|---|---|---|---|
| 1 | Revisar bandeja de entrada y abrir el correo | 1–3 min | Depende de con qué frecuencia revisa el correo |
| 2 | Descargar el PDF adjunto y abrirlo | 1–2 min | |
| 3 | Leer e interpretar el PDF (identificar cliente, referencias, cantidades) | 2–5 min | Más si el PDF está escaneado o es ilegible |
| 4 | Abrir SAP B1 (si no está abierto) y navegar a Órdenes de Venta | 1–3 min | Login + carga del módulo |
| 5 | Buscar y seleccionar el cliente por NIT o nombre | 1–3 min | |
| 6 | Ingresar fecha de OC y fecha de entrega | 30 seg | |
| **7** | **Ingresar cada línea de pedido** | **2–5 min/referencia** | **Cuello de botella principal** |
| 8 | Verificar totales PDF vs. lo ingresado | 1–2 min | |
| 9 | Guardar y confirmar la orden en SAP | 30 seg | |
| 10 | Archivar el correo o marcarlo como procesado | 1 min | |

La etapa 7 es dominante porque el operador debe cruzar la referencia del cliente contra el código interno SAP (AlternateCatNum). Es el paso que más tiempo consume y donde más errores ocurren.

---

## Tiempo Total por Escenario

| Escenario | Referencias | Tiempo total | Condición |
|---|---|---|---|
| Pedido simple | 1–3 | **8–15 min** | Cliente conocido, PDF claro, referencias en catálogo |
| Pedido mediano | 5–10 | **20–35 min** | Operador con experiencia, formato familiar |
| Pedido complejo | 15–30 | **45–90 min** | Referencias difíciles de cruzar, PDF escaneado, observaciones especiales |
| Cliente nuevo | cualquiera | **+15–30 min extra** | Hay que crearlo en SAP primero |

**Promedio realista** para una empresa con pedidos mixtos: **20–30 minutos por pedido.**

---

## Costo Laboral Mensual de la Digitación

Auxiliar de facturación en Colombia (costo total empresa):

| Concepto | Valor |
|---|---|
| Salario + prestaciones (todo costo) | ~$2.200.000 – $3.000.000 COP/mes |
| Horas efectivas trabajadas | ~160 h/mes |
| Costo por hora | ~$13.750 – $18.750 COP |
| Costo por pedido (a 25 min promedio) | **~$5.700 – $7.800 COP/pedido** |

### Proyección por Volumen

| Volumen mensual | Costo laboral solo en digitación |
|---|---|
| 30 pedidos/mes | $171.000 – $234.000 COP/mes |
| 60 pedidos/mes | $342.000 – $468.000 COP/mes |
| 100 pedidos/mes | $570.000 – $780.000 COP/mes |
| 200 pedidos/mes | $1.140.000 – $1.560.000 COP/mes *(requiere 2 personas)* |

---

## Costos Ocultos (No Capturados en el Estimado Base)

El número anterior subestima el costo real. Los siguientes factores incrementan el costo sin aparecer en la nómina de forma visible:

| Costo oculto | Impacto estimado |
|---|---|
| **Correcciones de errores de digitación** | Una devolución o nota crédito puede costar 3–5x el tiempo de la digitación original |
| **Tiempo del supervisor** revisando antes de aprobar | +20–30% sobre el tiempo del operador |
| **Pedidos urgentes fuera de horario** | Una OC que llega a las 5:30 PM no se digita hasta el día siguiente; riesgo de incumplimiento |
| **Rotación del cargo** | Cada vez que el digitador renuncia, hay 2–4 semanas de inducción del reemplazo |
| **Costo de oportunidad** | La persona que digita no está haciendo gestión de cartera, atención al cliente ni análisis de ventas |

---

## Comparación: Manual vs. OrderLoader

| Métrica | Digitación manual | OrderLoader |
|---|---|---|
| Tiempo por pedido | 20–30 min | < 2 min |
| Disponibilidad | Horario laboral | 6 AM – 10 PM, 7 días |
| Costo marginal por pedido adicional | $5.700 – $7.800 COP | ~$100 – $300 COP (costo API IA) |
| Escalabilidad | Lineal (más pedidos = más personal) | Constante (misma tarifa) |
| Tasa de error | Variable (fatiga, interrupciones) | Consistente (validación automática) |
| Trazabilidad | Ninguna (a menos que se documente manualmente) | Automática (conciliación PDF vs. SAP) |

---

## Argumento de ROI para el Prospecto

El cliente puede calcular su propio ROI en 2 minutos:

```
Pedidos al mes × 25 min × (salario mensual ÷ 160 h ÷ 60 min)
= Costo mensual actual de la digitación
```

**Ejemplo con 50 pedidos/mes y salario de $2.500.000 COP:**
```
50 × 25 × ($2.500.000 ÷ 160 ÷ 60) = 50 × 25 × $260 = $325.000 COP/mes
```

Si OrderLoader cuesta $900.000 COP/mes, el retorno en ahorro laboral puro es de **2.8 meses**.  
Sumando correcciones de errores, horas extra y costo de oportunidad, el ROI real es significativamente mayor.

---

## Señales de Alarma en el Prospecto

Durante la conversación de ventas, estas respuestas confirman que el prospecto tiene el problema:

- *"Tenemos a Sandra que se encarga de eso"* → dependencia de persona clave
- *"Los lunes son un caos"* → acumulación en horas pico
- *"A veces se nos pasa algún pedido"* → riesgo de pérdida de correos
- *"Tuvimos un problema con un despacho equivocado"* → error de digitación con consecuencias
- *"Cuando ella se va de vacaciones nos complicamos"* → proceso no documentado
