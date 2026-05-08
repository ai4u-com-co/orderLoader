# Propuesta de Valor (Value Proposition Canvas)

> Marco: Value Proposition Design — Alexander Osterwalder  
> El encaje entre lo que OrderLoader ofrece y lo que el cliente necesita

---

## Resumen Ejecutivo

> **OrderLoader convierte correos con PDFs de pedidos en órdenes de venta dentro de SAP B1 — de forma automática, sin errores y sin intervención humana — en menos de 2 minutos por pedido.**

---

## Canvas: Mapa de Valor

```
┌─────────────────────────────────────────────────────────────────┐
│                     MAPA DE VALOR                               │
│                   (OrderLoader 3.0)                             │
├─────────────────────┬───────────────────────────────────────────┤
│                     │                                           │
│   PRODUCTOS Y       │   ALIVIADORES         CREADORES           │
│   SERVICIOS         │   DE DOLOR            DE GANANCIA         │
│                     │                                           │
│ • Pipeline de       │ • Elimina digitación  • Pedidos en SAP    │
│   ingesta           │   manual              en <2 minutos       │
│   automatizado      │                       │
│                     │ • Cero errores de     • Escalabilidad     │
│ • IA Claude para    │   transcripción       sin contratar       │
│   extracción de     │                                           │
│   PDF               │ • Proceso autónomo    • Dashboard de      │
│                     │   7 días/semana       métricas            │
│ • Integración       │                                           │
│   nativa SAP B1     │ • Sin dependencia     • Inteligencia      │
│   Service Layer     │   de persona clave    sobre portafolio    │
│                     │                                           │
│ • Conciliación      │ • Archivado IMAP      • Proceso           │
│   PDF vs. SAP       │   automático          documentado         │
│                     │                       como activo         │
│ • Notificaciones    │ • Alertas ante        digital             │
│   y alertas         │   fallos              │
│                     │                                           │
│ • Dashboard web     │ • Trazabilidad        • Liberación del    │
│                     │   completa            talento humano      │
│ • Configuración     │                                           │
│   por cliente       │                                           │
│                     │                                           │
└─────────────────────┴───────────────────────────────────────────┘
```

---

## Declaración de Propuesta de Valor

### Plantilla Osterwalder
> *"Nuestro [producto/servicio] ayuda a [segmento] que quieren [job-to-be-done] a [aliviar el dolor X] y [obtener la ganancia Y]."*

**Para OrderLoader:**

> OrderLoader ayuda a **empresas con SAP Business One que reciben 30 o más pedidos de compra en PDF por correo al mes** — que quieren ingresar esos pedidos a SAP de forma rápida y sin errores — a **eliminar la digitación manual y sus costos asociados**, y a **escalar su operación comercial sin contratar más personal**.

---

## Encaje Problema–Solución (Problem–Solution Fit)

| Problema del cliente | Solución de OrderLoader | Evidencia de encaje |
|---|---|---|
| 15–30 min por pedido digitando manualmente | Pipeline automático end-to-end | <2 min por pedido en producción |
| Errores de transcripción costosos | IA + validación contra catálogo SAP | Conciliación automática registra diferencias |
| Acumulación en horas pico | Cron cada hora, 17h/día | Procesa bandeja completa en cada corrida |
| Dependencia de persona clave | Proceso codificado en software | Corre sin intervención humana |
| Sin visibilidad del proceso | Dashboard + notificaciones | Historial completo en SQLite |
| Formatos de PDF variables | Prompts específicos por cliente | 14+ clientes soportados en producción |

---

## Diferenciadores Clave vs. Alternativas

| Alternativa actual | Limitación | OrderLoader resuelve |
|---|---|---|
| Digitación manual | Lento, costoso, propenso a errores | Automatización completa |
| RPA tradicional (UiPath, AA) | Frágil ante cambios de layout del PDF | IA semántica, no coordenadas |
| OCR básico | Extrae texto pero no entiende contexto | Claude AI comprende semántica |
| Desarrollo a medida | Alto costo, largo tiempo de implementación | SaaS listo para usar |
| Módulo EDI de SAP | Solo funciona con clientes que tienen EDI | Funciona con cualquier PDF |

---

## Propuesta de Valor por Stakeholder

### Para el Gerente de Operaciones
> "Sus pedidos estarán en SAP antes de que su equipo llegue a la oficina."

### Para el Gerente Financiero
> "Reemplaza entre $3M–$6M COP/mes en costo laboral de digitación por una fracción del costo, con mayor confiabilidad."

### Para el Gerente de TI
> "Integración nativa vía SAP B1 Service Layer. Sin modificar el ERP. Sin riesgo de compatibilidad."

### Para el Auxiliar de Facturación / Digitador
> "Ya no vas a pasar el lunes digitando 20 PDFs. Puedes enfocarte en lo que realmente importa."

---

## Métricas de Validación del Encaje

| Métrica | Meta | Herramienta de medición |
|---|---|---|
| Tiempo de procesamiento por pedido | < 2 minutos | Pipeline logs |
| Tasa de pedidos procesados sin intervención | > 85% | Dashboard OrderLoader |
| Reducción de errores vs. proceso manual | > 90% | Comparación con histórico |
| ROI en los primeros 3 meses | > 3x el costo de la solución | Cálculo costo laboral vs. costo IA |
| NPS de usuarios en prueba piloto | > 70 | Encuesta post-piloto |
