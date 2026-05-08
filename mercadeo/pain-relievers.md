# Aliviadores de Dolor (Pain Relievers)

> Marco: Value Proposition Design — Alexander Osterwalder  
> Cómo OrderLoader 3.0 elimina o reduce los dolores del segmento objetivo

---

## Principio de Alineación

Cada aliviador debe corresponder directamente a un dolor identificado en el documento `pains.md`. Un aliviador que no atiende un dolor real es ruido de marketing.

---

## Aliviadores Críticos

### 1. Automatización completa del ciclo de ingesta
**Dolor que alivia:** Tiempo perdido en digitación manual (#1)  
OrderLoader monitorea la bandeja de entrada 17 horas al día (6 AM – 10 PM), descarga automáticamente los PDFs adjuntos y los procesa sin intervención humana. El tiempo por pedido pasa de 15–30 minutos a menos de 2 minutos.

### 2. Extracción con IA entrenada por cliente
**Dolor que alivia:** Variedad de formatos entre clientes (#8) y errores de digitación (#2)  
Claude AI interpreta el contenido semántico del PDF, no solo su estructura. Identifica referencias, cantidades, precios y fechas aunque el formato cambie. Cada cliente tiene un prompt configurado específicamente para su layout de OC, lo que reduce errores de interpretación a niveles mínimos.

### 3. Validación automática contra el catálogo SAP (AlternateCatNum)
**Dolor que alivia:** Errores de digitación que generan despachos incorrectos (#2)  
Antes de crear la orden en SAP, el sistema verifica que cada artículo pedido exista en el catálogo usando los números alternativos del cliente. Los artículos no catalogados se excluyen y se registran como discrepancias, evitando órdenes con referencias inválidas.

### 4. Procesamiento continuo sin cuello de botella humano
**Dolor que alivia:** Acumulación en horas pico (#3)  
El pipeline corre cada hora y procesa todos los correos pendientes en secuencia. No importa si llegan 2 o 20 pedidos en la misma hora: el sistema los consume uno a uno sin saturarse. No hay lunes caóticos ni cierres de mes estresantes.

### 5. Proceso documentado y ejecutado por software
**Dolor que alivia:** Dependencia de persona clave (#4)  
El proceso de digitación ya no vive en la cabeza de nadie. Está codificado en el pipeline. Si el operador de turno se ausenta, los pedidos siguen procesándose. El conocimiento es del sistema, no de la persona.

---

## Aliviadores Moderados

### 6. Conciliación automática PDF vs. SAP
**Dolor que alivia:** Falta de trazabilidad (#5)  
Después de crear la orden, el pipeline compara línea a línea lo que el cliente pidió en el PDF contra lo que quedó registrado en SAP. Las diferencias (artículos excluidos, cantidades ajustadas) quedan documentadas automáticamente en la base de datos.

### 7. Clasificación y archivo de correos en IMAP
**Dolor que alivia:** Correos perdidos o no procesados (#6)  
Cada correo procesado es movido a una carpeta IMAP específica según su resultado (Ingresado, Revisar IA, No reconocido). La bandeja de entrada queda limpia y es imposible que un pedido quede en estado ambiguo sin saberlo.

### 8. Escalabilidad sin contratación adicional
**Dolor que alivia:** Dificultad para escalar (#7)  
El costo de OrderLoader no escala con el volumen. Pasar de 30 a 300 pedidos/mes no requiere contratar más personal. El costo marginal por pedido adicional tiende a cero.

---

## Aliviadores Latentes

### 9. Cálculo de costo real por pedido
**Dolor que alivia:** Costo laboral oculto (#9)  
El script `calculate-costs.ts` permite calcular el costo de IA por pedido procesado. Puesto en contraste con el costo laboral actual, el ROI de OrderLoader se hace evidente y cuantificable para la gerencia.

### 10. Dashboard con historial y estado de cada pedido
**Dolor que alivia:** Ausencia de métricas (#10)  
La interfaz web muestra en tiempo real el estado de cada pedido: recibido, procesado, con errores, pendiente de revisión. Cada corrida del pipeline queda registrada con fecha, hora, resultados y diferencias detectadas.

### 11. Alertas tempranas ante fallos del pipeline
**Dolor que alivia:** Riesgo de incumplimiento a clientes (#11)  
Si el pipeline falla (error de conexión SAP, IMAP caído, error de IA), el sistema envía una alerta al correo de administración antes de que el problema escale. La empresa puede actuar antes de que un cliente reclame.
