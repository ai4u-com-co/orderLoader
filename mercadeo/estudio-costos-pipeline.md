# Estudio de Costos del Pipeline — OrderLoader 3.0

> Análisis basado en datos reales de producción.  
> DB: `orderloader.db` · Período: marzo–mayo 2026 · TRM: $4.200 COP/USD

---

## 1. Datos de Producción (Base Real)

| Métrica | Valor |
|---|---|
| Total de pedidos procesados | **116** |
| Período de datos | Mar–May 2026 (≈2 meses) |
| Clientes únicos atendidos | **15** |
| Promedio de líneas por pedido | **3,23 líneas** |
| Pedidos con 1 sola línea | 71 (61%) |
| Pedido más grande | 32 líneas |
| Volumen pico observado | 84 pedidos en abril 2026 |

### Distribución real de líneas por pedido

| Líneas/pedido | # de pedidos | % |
|---|---|---|
| 1 | 71 | 61% |
| 2 | 9 | 8% |
| 3 | 7 | 6% |
| 4–5 | 6 | 5% |
| 6–9 | 9 | 8% |
| 10–19 | 6 | 5% |
| 20+ | 2 | 2% |
| No registrado | 6 | 5% |

> Lectura: la mayoría de pedidos son de 1 referencia, pero los pedidos grandes (10+) representan el 7% del volumen y generan el mayor consumo de tokens por su densidad visual.

---

## 2. Consumo Real de la API de IA

### Por modelo y fase

| Modelo | Fase | Llamadas | Tokens Input | Tokens Output | Avg Input | Avg Output |
|---|---|---|---|---|---|---|
| Claude Sonnet 4.6 | `parse` (extracción PDF) | 124 | 324.220 | 38.595 | 2.615 | 311 |
| Claude Haiku 4.5 | `triage` (clasificación adjuntos) | 29 | 33.887 | 2.903 | 1.169 | 100 |
| **TOTAL** | | **153** | **358.107** | **41.498** | | |

> **Nota técnica:** El pipeline convierte cada página del PDF a imagen PNG antes de enviarlo a Claude Sonnet (vision). Los tokens de imagen se contabilizan en `input_tokens`. Haiku solo recibe texto (cabeceras de PDF y nombre de archivo).

---

## 3. Costo Real de la API (Datos Históricos)

### Precios Anthropic vigentes

| Modelo | Input (por 1M tokens) | Output (por 1M tokens) |
|---|---|---|
| Claude Sonnet 4.6 | $3,00 USD | $15,00 USD |
| Claude Haiku 4.5 | $0,80 USD | $4,00 USD |

### Cálculo sobre datos reales

| Componente | Costo USD | Costo COP |
|---|---|---|
| Sonnet 4.6 input: 324.220 tok × $3/1M | $0,9727 | $4.085 |
| Sonnet 4.6 output: 38.595 tok × $15/1M | $0,5789 | $2.431 |
| Haiku 4.5 input: 33.887 tok × $0,80/1M | $0,0271 | $114 |
| Haiku 4.5 output: 2.903 tok × $4/1M | $0,0116 | $49 |
| **TOTAL API (116 pedidos)** | **$1,5903 USD** | **$6.679 COP** |

### Costo de IA por unidad

| Métrica | USD | COP |
|---|---|---|
| Por pedido (116 pedidos) | $0,01371 | **$57,57** |
| Por línea de pedido (374 líneas) | $0,00425 | **$17,85** |

---

## 4. Costo de Infraestructura

El pipeline corre en Google Cloud Platform en un contenedor Docker.

| Componente | Costo estimado | Base |
|---|---|---|
| VM GCP (e2-small equiv.) | $10–20 USD/mes | Fijo |
| Almacenamiento (SQLite + PDFs) | $2–5 USD/mes | Fijo creciente |
| Red/egress | < $1 USD/mes | Variable |
| **Total infraestructura** | **≈ $30 USD/mes** | **≈ $126.000 COP/mes** |

### Costo de infraestructura por pedido según volumen

| Volumen mensual | Infra/mes | Costo infra/pedido | Costo infra/línea (3,23x) |
|---|---|---|---|
| 50 pedidos/mes | $126.000 COP | $2.520 COP | $780 COP |
| 84 pedidos/mes *(actual)* | $126.000 COP | $1.500 COP | $464 COP |
| 150 pedidos/mes | $126.000 COP | $840 COP | $260 COP |
| 300 pedidos/mes | $126.000 COP | $420 COP | $130 COP |

> La infraestructura es un **costo fijo**. Cuanto mayor el volumen, menor es su impacto por unidad.

---

## 5. Costo Total por Línea de Pedido

Combinando API + infraestructura:

| Volumen cliente | API/línea | Infra/línea | **Total costo/línea** |
|---|---|---|---|
| 50 ped/mes (161 líneas) | $18 COP | $780 COP | **$798 COP** |
| 84 ped/mes (271 líneas) *actual* | $18 COP | $464 COP | **$482 COP** |
| 150 ped/mes (484 líneas) | $18 COP | $260 COP | **$278 COP** |
| 300 ped/mes (969 líneas) | $18 COP | $130 COP | **$148 COP** |

> **Conclusión clave:** El costo de la API de IA es casi despreciable ($18 COP/línea, fijo). El costo dominante a bajo volumen es la infraestructura fija. A mayor escala, el costo total por línea colapsa hacia ~$20–50 COP.

---

## 6. Costo de Desarrollo y Soporte (OPEX)

Este es el costo más significativo en la etapa actual y el que justifica el pricing.

| Actividad | Tiempo estimado/mes | Costo (dev $50 USD/h) |
|---|---|---|
| Mantenimiento del pipeline | 4–8 h/mes | $840.000 – $1.680.000 COP |
| Soporte técnico clientes | 2–4 h/mes/cliente | $420.000 – $840.000 COP/cliente |
| Ajuste de prompts (nuevos formatos) | 2–4 h/cliente nuevo | One-time |
| Monitoreo y alertas | Automático (costo bajo) | < $100.000 COP/mes |

> A 3 clientes activos: OPEX de soporte ≈ $2.000.000 – $4.000.000 COP/mes.  
> Este costo debe ser cubierto por el modelo de suscripción/por-línea, no por la tarifa de implementación.

---

## 7. Resumen: Estructura de Costos por Línea

| Componente | Costo/línea (100 ped/mes) | % del total |
|---|---|---|
| API de IA (Anthropic) | $18 COP | 1% |
| Infraestructura GCP | $390 COP | 26% |
| Desarrollo y soporte (prorrateado) | ~$1.000 COP | 67% |
| Overhead (herramientas, misc) | ~$90 COP | 6% |
| **COSTO TOTAL/línea** | **~$1.500 COP** | 100% |

> **El costo marginal real de procesar una línea adicional es $18 COP.**  
> El costo de sostenibilidad del negocio (soporte + infra) es ~$1.500 COP/línea a escala media.  
> El precio de venta debe ser múltiplo del costo de sostenibilidad, no del costo marginal.

---

## 8. Costo de Implementación (Setup)

Lo que cuesta configurar un cliente nuevo:

| Actividad | Horas | Costo (dev $50/h) |
|---|---|---|
| Configuración IMAP + SAP B1 Service Layer | 3–5 h | $630.000 – $1.050.000 COP |
| Construcción y testeo del prompt de extracción | 2–4 h por cliente PDF | $420.000 – $840.000 COP/cliente |
| Pruebas en producción (10 pedidos reales) | 1–2 h | $210.000 – $420.000 COP |
| Capacitación del equipo | 1 h | $210.000 COP |
| **Total setup (1 cliente)** | **7–12 h** | **$1.470.000 – $2.520.000 COP** |
| **Total setup (3 clientes)** | **11–20 h** | **$2.310.000 – $4.200.000 COP** |

> El setup fee cubre este costo más un margen razonable. No es pura ganancia: representa trabajo real de configuración.
