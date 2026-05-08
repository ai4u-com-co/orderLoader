# Pricing — OrderLoader 3.0

> Modelo: **Implementación única + precio por línea de pedido procesada**.  
> No hay suscripción fija mensual. Pagas exactamente por lo que usas, sobre una base mínima.

---

## Por qué precio por línea (no por pedido ni suscripción fija)

- Una línea = un ítem/SKU dentro de un pedido. Es la unidad de trabajo real del pipeline.
- Un pedido de 1 línea requiere 1 llamada a la IA. Un pedido de 32 líneas requiere la misma llamada pero genera 32x más valor al cliente.
- Precio por línea **captura valor proporcional**: el cliente que manda pedidos grandes paga más que el que manda pedidos simples.
- Para el cliente es transparente y auditable: puede calcular su costo exacto con su propio volumen.

---

## Lógica de Diseño de Precios

### Fibonacci en los límites de cada plan
Los umbrales de líneas usan la **sucesión de Fibonacci** (…89, 144, 233, 377, 610, 987…).  
Son números que el cerebro percibe como naturales y progresivos.

```
Plan Esencial  → hasta  233 líneas/mes  (Fibonacci #13)
Plan Estándar  → hasta  610 líneas/mes  (Fibonacci #15)
Plan Industrial → ilimitadas
```

### Golden Ratio (φ) en los precios
La proporción entre el precio por línea de cada plan ≈ **φ = 1,618**:

```
$1.490 / $920  ≈ 1,62 ≈ φ
$920  / $570   ≈ 1,61 ≈ φ
```

Esta escala hace que cada plan parezca significativamente más eficiente que el anterior, incentivando el upgrade natural conforme crece el volumen.

### Anchoring
El plan **Industrial se presenta primero**: ancla la percepción de valor y hace que los planes inferiores parezcan accesibles.

### FOMO
Implementaciones limitadas a **4 por mes**. El setup requiere trabajo técnico dedicado.

---

## Implementación (Pago Único)

Cubre: conexión SAP B1 Service Layer, configuración IMAP, construcción y testeo de prompts por cliente, pruebas en producción, capacitación del equipo.

| Clientes a configurar | Costo de implementación |
|---|---|
| 1 – 2 clientes | **$900.000 COP** |
| 3 – 5 clientes | **$1.500.000 COP** |
| 6 – 10 clientes | **$2.400.000 COP** |
| 11 – 15 clientes | **$3.500.000 COP** |
| Cada cliente adicional (sobre el límite del plan) | **$320.000 COP c/u** |

> Un "cliente" = un proveedor/comprador cuyo formato de OC en PDF se configura individualmente.  
> La conexión SAP B1 es única por empresa (no se cobra por cliente).

---

## Los Tres Planes

---

### PLAN INDUSTRIAL
**Para operaciones con alto volumen o múltiples canales comerciales**

| | |
|---|---|
| **Precio por línea** | **$570 COP/línea** |
| Líneas incluidas | **Ilimitadas** |
| Mínimo mensual | $400.000 COP/mes |
| Clientes configurados | Hasta 15 |
| Costo cliente adicional | $320.000 COP (setup) |
| SLA soporte | 4 horas hábiles |

**Ejemplo con 200 pedidos/mes y 8 líneas promedio = 1.600 líneas:**
```
1.600 líneas × $570 = $912.000 COP/mes
Ahorro laboral estimado: $3.120.000+ COP/mes
ROI: 3,4x en el primer mes
```

---

### ⭐ PLAN ESTÁNDAR — MÁS POPULAR
**Para empresas en crecimiento con operación comercial activa**

| | |
|---|---|
| **Precio por línea** | **$920 COP/línea** |
| Líneas incluidas | Hasta **610**/mes |
| Mínimo mensual | $250.000 COP/mes |
| Clientes configurados | Hasta 8 |
| Costo cliente adicional | $320.000 COP (setup) |
| Líneas excedidas | Precio escala a Industrial ($570/línea) |
| SLA soporte | 8 horas hábiles |

**Ejemplo con 100 pedidos/mes y 5 líneas promedio = 500 líneas:**
```
500 líneas × $920 = $460.000 COP/mes
Ahorro laboral estimado: $1.300.000+ COP/mes
ROI: 2,8x en el primer mes
```

---

### PLAN ESENCIAL
**Para empresas que están automatizando por primera vez**

| | |
|---|---|
| **Precio por línea** | **$1.490 COP/línea** |
| Líneas incluidas | Hasta **233**/mes |
| Mínimo mensual | $150.000 COP/mes |
| Clientes configurados | Hasta 3 |
| Costo cliente adicional | $320.000 COP (setup) |
| Líneas excedidas | Precio escala a Estándar ($920/línea) |
| SLA soporte | 24 horas hábiles |

**Ejemplo con 50 pedidos/mes y 3 líneas promedio = 150 líneas:**
```
150 líneas × $1.490 = $223.500 COP/mes
Ahorro laboral estimado: $651.000+ COP/mes
ROI: 2,9x en el primer mes
```

---

## Comparativo de los Tres Planes

| | ESENCIAL | ESTÁNDAR ⭐ | INDUSTRIAL |
|---|:---:|:---:|:---:|
| Precio/línea | $1.490 COP | $920 COP | $570 COP |
| Límite líneas/mes | 233 | 610 | Ilimitadas |
| Mínimo mensual | $150.000 | $250.000 | $400.000 |
| Clientes configurados | 3 | 8 | 15 |
| SLA soporte | 24 h | 8 h | 4 h |
| Exceso de líneas | → precio Estándar | → precio Industrial | Incluido |

---

## Cómo Calcular Tu Costo Mensual

```
Costo mensual = MAX(mínimo del plan, líneas_del_mes × precio_por_línea)
```

**Calculadora rápida:**

| Pedidos/mes | Líneas promedio | Líneas totales | Plan recomendado | Costo estimado/mes |
|---|---|---|---|---|
| 30 | 3 | 90 | Esencial | $150.000 *(mínimo)* |
| 50 | 3 | 150 | Esencial | $223.500 |
| 80 | 5 | 400 | Estándar | $368.000 |
| 100 | 5 | 500 | Estándar | $460.000 |
| 150 | 6 | 900 | Industrial | $513.000 |
| 200 | 8 | 1.600 | Industrial | $912.000 |
| 300 | 10 | 3.000 | Industrial | $1.710.000 |

---

## Costo vs. Valor: El Argumento de ROI

El pipeline reemplaza trabajo humano que cuesta entre $15.000 y $18.750 COP por hora.  
Cada línea procesada manualmente toma en promedio **5–8 minutos** (buscar referencia en catálogo, ingresar en SAP, verificar).

| Líneas/mes | Costo manual estimado | Costo OrderLoader (Estándar) | Ahorro neto |
|---|---|---|---|
| 150 | $225.000 – $281.000 COP | $150.000 *(mínimo)* | +$75.000 – $131.000 |
| 500 | $750.000 – $937.000 COP | $460.000 | +$290.000 – $477.000 |
| 1.000 | $1.500.000 – $1.875.000 COP | $570.000 | +$930.000 – $1.305.000 |
| 3.000 | $4.500.000 – $5.625.000 COP | $1.710.000 | +$2.790.000 – $3.915.000 |

> *El costo manual no incluye errores de digitación, correcciones, notas crédito ni disponibilidad fuera de horario.*

---

## Costo Respaldado por Datos Reales

*Basado en el [estudio-costos-pipeline.md](estudio-costos-pipeline.md):*

| Costo real del pipeline | Por línea |
|---|---|
| API de IA (Anthropic) | $18 COP |
| Infraestructura GCP | $130 – $780 COP *(según volumen)* |
| Soporte y desarrollo | ~$1.000 COP *(prorrateado)* |
| **Costo total real** | **$148 – $1.500 COP** |

Los precios de venta ($570 – $1.490 COP/línea) son múltiplos de ese costo: entre **1x y 3x a alta escala**, justificando la sostenibilidad del producto.

---

## FOMO — Urgencia de Cierre

> **Solo se aceptan 4 implementaciones nuevas por mes.**  
> El setup requiere tiempo técnico dedicado para garantizar calidad desde el día uno.

**Oferta de apertura de mercado:**  
Los primeros 2 clientes nuevos que cierren cada mes obtienen el setup al **50%**:

| Clientes | Setup normal | Setup con oferta |
|---|---|---|
| 1 – 2 | $900.000 | ~~$900.000~~ **$450.000** |
| 3 – 5 | $1.500.000 | ~~$1.500.000~~ **$750.000** |
| 6 – 10 | $2.400.000 | ~~$2.400.000~~ **$1.200.000** |

---

## Notas de Negociación

- **No hacer descuentos en el precio por línea.** Es la métrica recurrente. Cualquier descuento aquí destruye el modelo a largo plazo.
- **El setup fee es negociable** para clientes estratégicos o que traigan volumen garantizado.
- **Si piden piloto:** ofrecer **30 días sin cobro por líneas** pagando solo el setup. Esto asegura compromiso real y cubre el costo técnico de la implementación.
- **Si están en Esencial pero superan 233 líneas:** la escalera de precios actúa sola. El exceso se cobra al precio de Estándar, y el cliente naturalmente ve el upgrade como la opción más inteligente.
- **Requisito técnico no negociable:** SAP B1 con Service Layer habilitado. Sin esto, no hay integración posible.
