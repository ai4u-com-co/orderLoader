# Business Model Canvas

> Marco: Business Model Generation — Alexander Osterwalder & Yves Pigneur  
> Modelo de negocio de OrderLoader 3.0

---

## Canvas Completo

```
┌──────────────────┬────────────────────┬─────────────────────┬──────────────────┬──────────────────┐
│  SOCIOS CLAVE    │  ACTIVIDADES CLAVE │  PROPUESTA DE VALOR │  RELACIÓN CON    │  SEGMENTOS DE    │
│                  │                    │                     │  CLIENTES        │  CLIENTES        │
│ • Anthropic      │ • Desarrollo y     │ Automatizar la      │                  │                  │
│   (API Claude)   │   mantenimiento    │ ingesta de pedidos  │ • Onboarding     │ Empresas con     │
│                  │   del pipeline     │ PDF a SAP B1 en     │   guiado         │ SAP B1 que       │
│ • SAP (Service   │                    │ <2 minutos, sin     │                  │ reciben ≥30      │
│   Layer API)     │ • Configuración    │ errores y sin       │ • Soporte        │ pedidos/mes      │
│                  │   de prompts por   │ intervención        │   técnico        │ en PDF por       │
│ • Proveedor      │   cliente          │ humana.             │   reactivo       │ correo           │
│   de hosting     │                    │                     │                  │                  │
│   (GCP/VPS)      │ • Integración      │ Para empresas con   │ • Monitoreo      │ Industrias:      │
│                  │   SAP B1 por       │ SAP B1 y ≥30        │   proactivo      │ textil,          │
│ • Partners       │   cliente          │ pedidos/mes.        │                  │ confección,      │
│   SAP B1         │                    │                     │ • Capacitaciones │ distribución,    │
│   (consultores)  │ • Soporte y        │                     │   ocasionales    │ manufactura      │
│                  │   mejora continua  │                     │                  │                  │
│                  │                    │                     │ • Alertas y      │ Geografía:       │
│                  │ • Ventas y         │                     │   notificaciones │ Colombia         │
│                  │   onboarding de    │                     │   automáticas    │ (expansión       │
│                  │   nuevos clientes  │                     │                  │ LATAM)           │
├──────────────────┴────────────────────┤                     ├──────────────────┴──────────────────┤
│  RECURSOS CLAVE                       │                     │  CANALES                            │
│                                       │                     │                                     │
│ • Código fuente del pipeline          │                     │ • Venta directa (outbound)          │
│   (Next.js, TypeScript, better-sqlite)│                     │ • Red de partners SAP B1            │
│ • Prompts de extracción por cliente   │                     │ • LinkedIn (decisores TI/Ops)       │
│ • Expertise en SAP B1 Service Layer   │                     │ • Referidos de clientes actuales    │
│ • Infraestructura en GCP / Docker     │                     │ • Demos en vivo (pipeline real)     │
│ • Equipo técnico (dev + soporte)      │                     │                                     │
└───────────────────────────────────────┴─────────────────────┴─────────────────────────────────────┘
┌─────────────────────────────────────────────┬───────────────────────────────────────────────────────┐
│  ESTRUCTURA DE COSTOS                        │  FUENTES DE INGRESOS                                 │
│                                             │                                                       │
│ • API Anthropic (Claude) — variable por uso  │ • Suscripción mensual fija por empresa cliente       │
│ • Hosting GCP / VPS — fijo mensual           │   (independiente del volumen de pedidos)             │
│ • Tiempo de desarrollo y soporte — mayor     │                                                       │
│   costo actual (bootstrapped)                │ • Tarifa única de implementación e integración       │
│ • Licencia SAP B1 del cliente (del cliente)  │   (setup fee por cliente nuevo)                      │
│ • Herramientas SaaS (email, monitoreo)       │                                                       │
│                                             │ • Configuración de nuevos clientes/formatos           │
│ **Estructura de costos:** orientada a valor  │   (fee por cliente PDF adicional)                    │
│ (el precio se fija por valor entregado,      │                                                       │
│  no por costo marginal)                     │ **Modelo:** SaaS B2B recurrente                       │
└─────────────────────────────────────────────┴───────────────────────────────────────────────────────┘
```

---

## Descripción Detallada de Cada Bloque

---

### 1. Segmentos de Clientes

**Primario:** Empresas medianas con SAP Business One activo que reciben ≥30 pedidos de compra mensuales en PDF por correo electrónico.  
**Secundario:** Partners e implementadores de SAP B1 que revenden o recomiendan soluciones complementarias.

Ver detalle en [customer-segments.md](customer-segments.md).

---

### 2. Propuesta de Valor

**Para el operador:** Ya no digitás pedidos manualmente.  
**Para el gerente:** Tus pedidos están en SAP antes de abrir la oficina, con trazabilidad completa.  
**Para la empresa:** El proceso de ingesta escala con el negocio sin contratar más gente.

Ver detalle en [value-proposition.md](value-proposition.md).

---

### 3. Canales

| Canal | Etapa del funnel | Rol |
|---|---|---|
| LinkedIn (outreach directo) | Awareness + Consideración | Contactar gerentes de Ops y TI en empresas con SAP B1 |
| Demos en vivo del pipeline | Consideración + Decisión | Mostrar el sistema corriendo con datos reales en <30 min |
| Red de partners SAP B1 | Generación de leads | Consultores que implementan SAP recomiendan OrderLoader |
| Referidos de clientes | Decisión + Fidelización | Clientes satisfechos refieren a contactos de su red |
| Website / landing page | Awareness | Explicar el problema y la solución con casos de uso |

---

### 4. Relación con Clientes

| Tipo de relación | Descripción |
|---|---|
| **Onboarding guiado** | Implementación asistida: configuración IMAP, SAP Service Layer, prompts por cliente |
| **Soporte técnico reactivo** | Canal de comunicación directo (email/WhatsApp) para incidentes |
| **Monitoreo proactivo** | El sistema alerta automáticamente ante fallos antes de que el cliente lo note |
| **Revisión periódica** | Check-in mensual para revisar métricas, ajustar prompts y detectar nuevos clientes |

---

### 5. Fuentes de Ingresos

| Fuente | Tipo | Frecuencia |
|---|---|---|
| Suscripción mensual por empresa | Recurrente fijo | Mensual |
| Setup fee de implementación | One-time | Por cliente nuevo |
| Fee por integración de nuevo cliente PDF | Variable | Por cliente adicional configurado |

**Rango estimado de precios (referencia):**
- Setup fee: $1.500.000 – $3.000.000 COP (una vez)
- Suscripción mensual: $800.000 – $2.500.000 COP/mes según volumen y complejidad

---

### 6. Recursos Clave

| Recurso | Tipo | Importancia |
|---|---|---|
| Pipeline de software (código fuente) | Intelectual | Crítico — es el producto |
| Prompts de extracción por cliente | Intelectual | Crítico — diferenciador de calidad |
| Expertise SAP B1 Service Layer | Humano | Alto — barrera de entrada |
| Infraestructura cloud (GCP + Docker) | Físico | Medio — reemplazable |
| Red de contactos en industria textil | Humano | Alto — tracción inicial |

---

### 7. Actividades Clave

| Actividad | Descripción |
|---|---|
| Desarrollo del pipeline | Mantenimiento, mejoras, nuevas funcionalidades del core |
| Integración por cliente | Configurar IMAP, SAP, prompts y testear con datos reales del cliente |
| Soporte técnico | Resolver incidentes, ajustar prompts cuando llegan formatos nuevos |
| Ventas y demos | Identificar prospectos, agendar demos, cerrar contratos |
| Mejora de modelos de IA | Optimizar prompts para mejorar tasa de éxito y reducir costos de API |

---

### 8. Socios Clave

| Socio | Rol | Tipo de alianza |
|---|---|---|
| **Anthropic** (API Claude) | Proveedor del motor de IA para extracción de PDF | Proveedor crítico |
| **SAP** (Service Layer) | API de integración con el ERP del cliente | Dependencia técnica |
| **Google Cloud Platform** | Infraestructura de hosting en producción | Proveedor de infraestructura |
| **Partners SAP B1** | Canal de distribución y generación de leads | Canal de ventas |

---

### 9. Estructura de Costos

| Costo | Tipo | Magnitud relativa |
|---|---|---|
| API Anthropic (Claude) | Variable por pedido procesado | Bajo — ~$0.01–0.05 USD por pedido |
| Hosting GCP / VPS | Fijo mensual | Bajo — $30–100 USD/mes por cliente |
| Tiempo desarrollo y soporte | Fijo (equipo) | Alto — mayor costo en etapa actual |
| Herramientas (monitoreo, email) | Fijo mensual | Muy bajo |

**El modelo de costos favorece la escalabilidad:** los costos marginales (API + hosting) son muy bajos; el costo dominante es el equipo humano, que no escala linealmente con el número de clientes.

---

## Lógica de Escalabilidad del Modelo

```
Clientes 1–5:     Bootstrapped. Ingresos cubren costos variables.
Clientes 6–15:    Ingresos cubren costos variables + parte del equipo.
Clientes 16–30:   Margen positivo. Posible contratación de soporte dedicado.
Clientes 30+:     Modelo SaaS maduro. Automatización del onboarding.
```

**El moat (ventaja competitiva duradera)** se construye en los prompts por cliente y en el expertise de integración SAP B1: ambos requieren tiempo y conocimiento específico que no se puede replicar rápidamente.
