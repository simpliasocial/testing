# ARQUITECTURA DASHBOARD SIMPLIALEADS

SimpliaLeads

Arquitectura Final del Dashboard

Documento funcional para producto, UX y desarrollo



Objetivo del documento. Definir la arquitectura final del dashboard de SimpliaLeads, los layers prioritarios del producto y, dentro de cada layer, los KPIs, tablas y componentes necesarios para una implementación coherente y accionable.

Uso recomendado: compartir con desarrolladores, PM y responsables de producto como blueprint funcional base.



1. Enfoque general

La arquitectura propuesta no trata al dashboard como un tablero estático de BI, sino como un sistema de control comercial. La secuencia de lectura recomendada es: entender el negocio, diagnosticar el funnel, revisar la ejecución operativa, accionar sobre leads concretos, analizar rendimiento por segmento, ver tendencias y, finalmente, exportar o automatizar reportes.

Principios de diseño

• Primero overview; luego diagnóstico; finalmente acción.

• Las métricas agregadas no deben reemplazar la ejecución diaria sobre leads.

• Cada layer debe responder una pregunta de negocio específica.

• Las tablas operativas deben ser accionables, no solo descriptivas.

• La reportería debe soportar tanto exportaciones manuales como envíos automáticos.

Resumen ejecutivo de layers

2. Layer 1 - Executive Overview

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

3. Layer 2 - Funnel / Conversion Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

4. Layer 3 - Operational Efficiency Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

5. Layer 4 - Lead Action Queue / Manual Follow-up Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

6. Layer 5 - Source / Campaign / Owner Performance Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

7. Layer 6 - Trend Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

8. Layer 7 - Reporting / Exports / Scheduled Reports Layer

KPIs necesarios

Componentes / visuales necesarios

Tablas / estructuras mínimas

9. Orden de implementación recomendado

10. Cierre

Esta arquitectura deja al producto en una posición más sólida porque separa claramente tres niveles: lectura ejecutiva, gestión operativa y distribución automática de información. El dashboard deja de ser solo un tablero analítico y pasa a funcionar como un sistema de control comercial y ejecución diaria.

Nota para desarrollo. Los nombres finales de estados, fórmulas de KPI y reglas de prioridad deben alinearse con el diccionario funcional y el diccionario de KPIs vigentes del producto.

## TABLA 1

| Versión | Final - Abril 2026 |
## TABLA 2

| Layer | Nombre | Propósito | Prioridad |
| 1 | Executive Overview | Lectura ejecutiva inmediata del estado del sistema | Muy alta |
| 2 | Funnel / Conversion | Entender avance y pérdida entre etapas del funnel | Muy alta |
| 3 | Operational Efficiency | Medir velocidad, SLA, backlog y disciplina operativa | Muy alta |
| 4 | Lead Action Queue | Mostrar qué leads requieren acción humana inmediata | Muy alta |
| 5 | Source / Campaign / Owner Performance | Comparar rendimiento por segmento | Alta |
| 6 | Trend | Analizar evolución temporal del sistema | Alta |
| 7 | Reporting / Exports / Scheduled Reports | Descargar, compartir y automatizar reportes | Muy alta |
## TABLA 3

| Objetivo | Dar una lectura ejecutiva del estado general del sistema en pocos segundos. |
| Pregunta que responde | ¿Cómo está rindiendo el sistema en términos generales? |
| Usuario principal | CEO, gerente general, gerente comercial. |
## TABLA 4

| KPI | Qué mide |
| Leads entrantes | Total de leads ingresados en el periodo. |
| Leads contactados | Leads con al menos un contacto válido. |
| Tasa de contacto | Porcentaje de leads entrantes que fueron contactados. |
| Leads interesados | Leads que muestran interés real. |
| Tasa de interés | Porcentaje de leads contactados que pasan a interesados. |
| Citas agendadas | Total de citas creadas en el periodo. |
| Tasa de agendamiento | Porcentaje de leads interesados que pasan a cita. |
| Tiempo mediano a primer contacto | Velocidad de respuesta inicial. |
| % dentro de SLA | Porcentaje de leads atendidos dentro del tiempo objetivo. |
| Leads perdidos | Leads cerrados como perdidos en el periodo. |
## TABLA 5

| Componente | Función |
| KPI cards principales | Mostrar los KPIs críticos del negocio. |
| Delta vs periodo anterior | Aportar contexto comparativo. |
| Mini trendlines | Indicar dirección de cambio sin cargar detalle. |
| Filtros globales | Fecha, canal, campaña y responsable. |
## TABLA 6

| Tabla / estructura | Definición mínima |
| Resumen ejecutivo | No requiere una tabla pesada. Puede incluir un cuadro corto de KPIs con valor actual y variación. |
## TABLA 7

| Objetivo | Mostrar cómo avanzan los leads a través del ciclo comercial y dónde se pierden oportunidades. |
| Pregunta que responde | ¿En qué etapa del funnel estamos perdiendo más oportunidades? |
| Usuario principal | Gerente comercial, ventas, operaciones. |
## TABLA 8

| KPI | Qué mide |
| Leads entrantes | Base inicial del funnel. |
| Leads contactados | Primer avance real del proceso. |
| Tasa de contacto | Entrantes a contactados. |
| Leads interesados | Paso de intención comercial. |
| Tasa de interés | Contactados a interesados. |
| Citas agendadas | Paso operativo más valioso. |
| Tasa de agendamiento | Interesados a agendados. |
| Conversión total a cita | Entrantes a agendados. |
| Drop-off por etapa | Pérdida entre cada etapa. |
| Leads perdidos | Volumen descartado. |
| Leads sin respuesta | Volumen estancado en el proceso. |
## TABLA 9

| Componente | Función |
| Funnel principal o barras secuenciales | Visualizar caída por etapa con claridad. |
| Cards de tasas por etapa | Resumir porcentajes de avance. |
| Distribución por estado actual | Mostrar mezcla operativa del pipeline. |
## TABLA 10

| Tabla / estructura | Definición mínima |
| Tabla resumen del funnel | Columnas mínimas: Etapa | Volumen | % sobre total inicial | % avance a siguiente etapa | Drop-off. |
## TABLA 11

| Objetivo | Medir la calidad de ejecución operativa: velocidad, disciplina, backlog y cumplimiento. |
| Pregunta que responde | ¿Estamos gestionando los leads con la rapidez y consistencia esperadas? |
| Usuario principal | Operaciones, supervisor comercial, PM del cliente. |
## TABLA 12

| KPI | Qué mide |
| Tiempo mediano a primer contacto | Velocidad real de primera respuesta. |
| Tiempo promedio a primer contacto | Visión general complementaria. |
| % dentro de SLA | Cumplimiento del objetivo operativo. |
| % fuera de SLA | Retrasos operativos. |
| Leads pendientes de gestión | Leads abiertos aún no trabajados. |
| Leads sin respuesta | Leads que no respondieron tras contacto. |
| Leads reactivables | Casos aptos para retomar. |
| Aging promedio del lead | Antigüedad media del pipeline activo. |
| Leads vencidos por SLA | Casos urgentes no atendidos a tiempo. |
| Leads sin owner | Riesgo operativo por falta de asignación. |
## TABLA 13

| Componente | Función |
| KPI cards operativas | Resumen rápido de ejecución. |
| Bullet chart de SLA | Real vs objetivo. |
| Barras por aging bucket | Detectar envejecimiento del pipeline. |
| Comparativo por owner | Revisar diferencias de ejecución. |
## TABLA 14

| Tabla / estructura | Definición mínima |
| Tabla de backlog operativo | Columnas mínimas: Estado | Volumen | % del total | Observación. |
| Tabla por owner | Columnas mínimas: Responsable | Leads asignados | Pendientes | % dentro SLA | Tiempo mediano a contacto | Citas agendadas. |
| Tabla de aging | Buckets mínimos: 0-1 días | 2-3 días | 4-7 días | 8-14 días | 15+ días. |
## TABLA 15

| Objetivo | Convertir el dashboard en una herramienta de ejecución diaria sobre leads concretos. |
| Pregunta que responde | ¿A quién debo contactar hoy y por qué? |
| Usuario principal | Ejecutivo comercial, admisiones, backoffice, equipo de seguimiento. |
## TABLA 16

| KPI | Qué mide |
| Leads pendientes de acción manual | Casos que requieren intervención humana. |
| Leads críticos hoy | Casos urgentes según prioridad. |
| Leads vencidos por SLA | Seguimientos atrasados. |
| Leads sin asignar | Riesgo de abandono por falta de owner. |
| Leads reactivables | Oportunidades recuperables. |
| Leads con interés sin cita | Casos calientes sin siguiente paso. |
| Leads con intento fallido | Casos que necesitan nuevo contacto. |
## TABLA 17

| Componente | Función |
| Tabla priorizada principal | Work queue accionable. |
| Filtros rápidos | Prioridad, responsable, estado, canal y campaña. |
| Badges de prioridad | Alta, media y baja. |
| Vistas rápidas | Sin gestionar hoy, interesados sin cita, reactivables, SLA vencido y sin owner. |
## TABLA 18

| Tabla / estructura | Definición mínima |
| Lead Action Queue | Campos mínimos: Lead ID | Nombre | Teléfono/canal | Canal | Campaña | Estado actual | Motivo de acción manual | Última interacción | Tiempo desde última interacción | Próxima acción sugerida | Prioridad | Responsable | Fecha de ingreso | Fecha límite SLA | Número de intentos previos | Observación breve. |
## TABLA 19

| Objetivo | Comparar el rendimiento por fuente, campaña y responsable para detectar calidad y eficiencia por segmento. |
| Pregunta que responde | ¿Qué fuente, campaña o responsable genera mejores resultados? |
| Usuario principal | Gerente comercial, marketing, dirección. |
## TABLA 20

| KPI | Qué mide |
| Leads entrantes | Volumen generado. |
| Leads contactados | Contactabilidad por segmento. |
| Tasa de contacto | Capacidad de activar el lead. |
| Leads interesados | Calidad comercial por segmento. |
| Tasa de interés | Calidad del proceso medio. |
| Citas agendadas | Resultado operativo. |
| Tasa de agendamiento | Eficiencia comercial final. |
| Leads perdidos | Pérdida por canal/campaña/owner. |
| Tasa de descarte | Calidad baja o desalineación. |
| Tiempo mediano a contacto | Velocidad comparada. |
## TABLA 21

| Componente | Función |
| Barras comparativas por canal | Ranking simple de rendimiento. |
| Barras comparativas por campaña | Comparación granular. |
| Ranking por owner | Comparación individual. |
| Tabla detallada multidimensión | Análisis comparativo preciso. |
## TABLA 22

| Tabla / estructura | Definición mínima |
| Tabla por canal | Columnas mínimas: Canal | Leads entrantes | Tasa de contacto | Tasa de interés | Tasa de agendamiento | Tiempo mediano a contacto. |
| Tabla por campaña | Columnas mínimas: Campaña | Leads entrantes | Contactados | Interesados | Agendados | Tasa de agendamiento. |
| Tabla por responsable | Columnas mínimas: Responsable | Leads asignados | Contactados | Interesados | Agendados | % SLA | Tiempo mediano a contacto. |
## TABLA 23

| Objetivo | Evaluar si el sistema mejora, empeora o se estanca en el tiempo. |
| Pregunta que responde | ¿Cómo está evolucionando el sistema por periodo? |
| Usuario principal | Dirección, comercial y operaciones. |
## TABLA 24

| KPI | Qué mide |
| Leads entrantes por periodo | Ritmo de entrada. |
| Leads contactados por periodo | Activación. |
| Interesados por periodo | Calidad. |
| Citas agendadas por periodo | Resultado. |
| Tasa de contacto por periodo | Eficiencia inicial. |
| Tasa de interés por periodo | Calidad del funnel medio. |
| Tasa de agendamiento por periodo | Eficiencia final. |
| Tiempo a primer contacto por periodo | Evolución operativa. |
| % dentro SLA por periodo | Disciplina operacional. |
| Leads perdidos por periodo | Desgaste o fricción. |
## TABLA 25

| Componente | Función |
| Líneas temporales | Ver evolución de volumen y resultados. |
| Columnas por periodo | Comparar magnitudes. |
| Comparativo periodo actual vs anterior | Interpretación rápida de cambio. |
## TABLA 26

| Tabla / estructura | Definición mínima |
| Tabla de tendencias | Columnas mínimas: Periodo | Leads entrantes | Contactados | Interesados | Agendados | Tasa de contacto | Tasa de agendamiento | Tiempo mediano a contacto. |
## TABLA 27

| Objetivo | Permitir la descarga manual de información y la automatización de reportes periódicos por correo. |
| Pregunta que responde | ¿Qué información quiero exportar o mandar automáticamente, a quién y con qué frecuencia? |
| Usuario principal | Gerencia, operaciones, cliente final y stakeholders. |
## TABLA 28

| KPI | Qué mide |
| Reportes creados | Total de configuraciones existentes. |
| Reportes activos | Automatizaciones vigentes. |
| Reportes enviados hoy | Actividad del sistema. |
| Últimos envíos exitosos | Salud operativa de la reportería. |
| Envíos fallidos | Incidencias que requieren revisión. |
## TABLA 29

| Componente | Función |
| Botón Export CSV | Descarga manual del dataset filtrado. |
| Selector de tipo de reporte | Elegir qué dataset o resumen exportar. |
| Configurador de envíos | Definir mails, frecuencia, horario y filtros. |
| Historial de envíos | Trazabilidad del módulo. |
| Acciones de editar / pausar / eliminar | Gestión de automatizaciones. |
## TABLA 30

| Tabla / estructura | Definición mínima |
| Tabla de reportes programados | Columnas mínimas: Report name | Tipo | Frecuencia | Destinatarios | Último envío | Estado | Activo. |
| Tabla de logs de ejecución | Columnas mínimas: Fecha | Reporte | Resultado | Destinatarios | Observación. |
| Configuración de reporte | Campos mínimos: nombre del reporte, tipo, rango de fechas, filtros, formato CSV, correos destinatarios, frecuencia, día, hora, activo/inactivo, último envío y status. |
## TABLA 31

| Fase | Layers | Motivo | Prioridad |
| Fase 1 | Executive Overview + Funnel + Operational Efficiency | Base mínima para lectura ejecutiva y diagnóstico inmediato. | Crítica |
| Fase 2 | Lead Action Queue | Convierte el dashboard en herramienta operativa diaria. | Crítica |
| Fase 3 | Source/Campaign/Owner Performance + Trend | Añade profundidad analítica y mejora de decisiones. | Alta |
| Fase 4 | Reporting / Exports / Scheduled Reports | Escala la distribución de información y reduce trabajo manual. | Alta |
