# Creadores de Ganancia (Gain Creators)

> Marco: Value Proposition Design — Alexander Osterwalder  
> Cómo OrderLoader 3.0 genera o potencia las ganancias del cliente

---

## Principio de Alineación

Cada creador de ganancia corresponde a una ganancia identificada en `gains.md`. El objetivo es ir más allá de "no duele" y llegar a "esto me da una ventaja real".

---

## Creadores de Ganancias Requeridas

### 1. Creación directa de Sales Order en SAP B1 vía Service Layer
**Ganancia que crea:** Pedidos correctamente en SAP (#1)  
OrderLoader se conecta al SAP B1 Service Layer y crea la Sales Order usando los mismos campos que usaría un operador humano experto: CardCode del cliente, ItemCode de cada artículo, cantidades, precios y fechas de entrega. El resultado es indistinguible de una digitación manual perfecta.

### 2. Pipeline autónomo con recuperación automática
**Ganancia que crea:** Funcionar sin intervención manual constante (#2)  
Si una corrida del pipeline es interrumpida (corte de luz, reinicio del servidor), la siguiente corrida detecta movimientos IMAP pendientes y los completa antes de continuar. El sistema se autorepara sin que nadie tenga que intervenir.

---

## Creadores de Ganancias Esperadas

### 3. Procesamiento en menos de 2 minutos por pedido
**Ganancia que crea:** Reducción del tiempo de procesamiento (#3)  
El tiempo total desde que llega el correo hasta que la orden existe en SAP es inferior a 2 minutos en condiciones normales. Con volúmenes altos, el sistema procesa los pedidos en paralelo al pipeline, no en cola manual.

### 4. Notificación HTML de resumen por corrida
**Ganancia que crea:** Notificaciones claras del resultado (#4)  
Al finalizar cada corrida, el sistema envía un correo HTML con: número de pedidos procesados, detalle por cliente, artículos excluidos, errores detectados y link al dashboard. El responsable sabe exactamente qué pasó sin abrir SAP.

### 5. Registro de conciliación por pedido
**Ganancia que crea:** Trazabilidad PDF vs. SAP (#5)  
La base de datos SQLite guarda, para cada pedido: el PDF original, el JSON extraído por la IA, la orden creada en SAP y las diferencias detectadas. Es la fuente de verdad ante cualquier reclamo.

### 6. Prompts configurados por cliente
**Ganancia que crea:** Cobertura de múltiples clientes (#6)  
Cada cliente tiene un prompt de extracción personalizado en `/lib/prompts`. Cuando se agrega un nuevo cliente, se crea su prompt sin modificar la lógica central del pipeline. La solución escala a cualquier número de clientes.

---

## Creadores de Ganancias Deseadas

### 7. Costo fijo independiente del volumen de pedidos
**Ganancia que crea:** Escalabilidad sin costo adicional (#7)  
El precio de OrderLoader es una tarifa fija mensual. No hay costo por pedido adicional, ni licencias por usuario. Una empresa que pase de 50 a 500 pedidos/mes paga lo mismo por la plataforma.

### 8. Dashboard web con métricas por cliente y por período
**Ganancia que crea:** Dashboard con métricas del proceso (#8)  
La interfaz web (protegida con Basic Auth) muestra historial de pedidos, estado por cliente, tasa de éxito, artículos excluidos frecuentes y tiempos de procesamiento. Datos accionables para la gerencia de operaciones.

### 9. Eliminación del trabajo repetitivo de alto estrés
**Ganancia que crea:** Reducción del estrés operativo (#9)  
El equipo ya no pasa el lunes con 20 PDFs apilados para digitar. Los pedidos que llegaron el fin de semana ya están en SAP el lunes en la mañana. El equipo arranca la semana con el trabajo hecho.

### 10. Redirección de talento humano a tareas de valor
**Ganancia que crea:** Liberación del capital humano (#10)  
El tiempo liberado (estimado entre 20–80 horas/mes según volumen) puede redirigirse a gestión de relaciones con clientes, análisis de ventas, control de cartera o mejora de procesos. El retorno es mayor que el ahorro directo en horas.

---

## Creadores de Ganancias Inesperadas

### 11. Alerta de artículos no catalogados = oportunidad comercial
**Ganancia que crea:** Detección de referencias no catalogadas (#11)  
Cada vez que un cliente pide una referencia que no existe en SAP, OrderLoader lo registra. Acumulado en el tiempo, esto revela qué artículos los clientes están comprando a la competencia porque el proveedor no los tiene en su catálogo. Es inteligencia comercial gratuita.

### 12. Historial independiente del ERP
**Ganancia que crea:** Registro histórico de pedidos (#12)  
La base de datos de OrderLoader es independiente de SAP. Si hay un problema con el ERP, la empresa conserva el registro de todos los pedidos recibidos, con sus PDFs originales, en un sistema separado y respaldado automáticamente.

### 13. Proceso documentado = empresa más vendible
**Ganancia que crea:** Reducción del riesgo ante salida de personal (#13)  
Desde la perspectiva de valoración empresarial, un proceso codificado en software vale más que uno que depende de personas. OrderLoader convierte un proceso informal en un activo digital.

### 14. Pedidos más rápidos = mayor satisfacción del cliente final
**Ganancia que crea:** Mejora en percepción del cliente externo (#14)  
El comprador que envía la OC recibe confirmación más rápido, su pedido se despacha a tiempo, y los errores de entrega se reducen. OrderLoader mejora la experiencia del cliente sin que el cliente sepa que existe.
