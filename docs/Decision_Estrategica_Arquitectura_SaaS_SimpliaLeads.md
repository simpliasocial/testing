# Decision Estrategica de Arquitectura SaaS Multiempresa

SimpliaLeads - evaluacion de alternativas, costos, riesgos y recomendacion para escalar a 26 clientes nuevos por ano

| Campo | Valor |
| --- | --- |
| Codigo | SIMPLIA-SAA-DEC-001 |
| Version | 1.0 |
| Estado | Borrador formal para decision interna |
| Fecha | 2026-05-14 |
| Zona horaria | America/Guayaquil |
| Responsable | Simplia - Producto y Tecnologia |
| Audiencia | Direccion, Gerencia, Producto, Tecnologia y Operaciones |

## Control Documental

| Version | Fecha | Cambio | Responsable |
| --- | --- | --- | --- |
| 1.0 | 2026-05-14 | Documento base generado para revision interna. | Simplia - Producto y Tecnologia |

## Resumen ejecutivo y recomendacion

> **Decision recomendada**
>
> Construir SimpliaLeads como SaaS pooled: un repositorio, una aplicacion Vercel global, un proyecto Supabase compartido inicialmente, tablas compartidas con company_id, RLS estricto y configuracion por empresa. Mantener un modelo bridge/enterprise como excepcion pagada para clientes que requieran aislamiento dedicado.

El problema actual no es solamente de infraestructura. Es un problema de producto: si cada cliente tiene su propio repo, Supabase y Vercel, cada feature se transforma en una tarea repetida por cliente. Con 26 clientes nuevos por ano, ese modelo deja de ser mantenible incluso si al inicio funciona con dos clientes.

La decision recomendada separa codigo, datos y configuracion. El codigo se despliega una vez para todos. Los datos se separan por company_id y RLS. Las diferencias entre empresas se expresan como configuracion, prompts, plantillas, integraciones, labels, feature flags y permisos, no como branches ni forks permanentes.

- No usar branch por cliente como estrategia permanente.
- No crear Vercel por cliente como estandar.
- No crear tablas por cliente.
- No dejar datos de negocio en public sin RLS.
- Si un cliente necesita aislamiento fuerte, venderlo como plan enterprise/bridge con precio y mantenimiento adicional.

## Diagnostico del problema actual

El flujo actual parte de un dashboard en GitHub conectado a Vercel desde main. Para cada negocio se replica el repositorio y se crea un proyecto Supabase con sus propias tablas. En el cliente actual, el schema cw concentra los backups y datos derivados de Chatwoot, mientras public contiene tablas operativas de automatizaciones n8n y configuraciones puntuales.

Ese modelo parece seguro porque cada cliente esta separado, pero no escala como producto. Cada cambio funcional, ajuste visual, correccion de seguridad, nueva tabla, funcion Edge o cron debe repetirse en todos los clientes. Si el cambio se genero por iteraciones con prompts, la probabilidad de inconsistencias sube con cada cliente.

- A 2 clientes todavia se puede replicar manualmente; a 5 ya es una operacion fragil; a 26 nuevos por ano se vuelve inviable.
- La calidad del producto se rompe porque cada cliente puede quedar en una version distinta.
- El soporte se vuelve mas caro porque no existe una sola fuente de verdad.
- La seguridad se vuelve dificil de auditar porque policies, tablas y secrets viven en lugares repetidos.
- La venta de cambios personalizados sin arquitectura de configuracion crea forks encubiertos.

## Proyeccion comercial y costos externos

El supuesto corregido es 26 clientes nuevos por ano. El objetivo real no es solo vender 26 al ano, sino retenerlos, porque la data se conserva durante 5 anos por cliente. Por eso, el almacenamiento y los historicos crecen por cohortes, aunque la venta anual se mantenga constante.

### Proyeccion de clientes activos con retencion anual

| Periodo | Acumulados antes de churn | Activos con 90% | Activos con 95% | Activos con 98% |
| --- | --- | --- | --- | --- |
| Ano 1 | 26 | 26.0 | 26.0 | 26.0 |
| Ano 3 | 78 | 70.5 | 74.2 | 76.5 |
| Ano 5 | 130 | 106.5 | 117.6 | 124.9 |

> Formula: 26 clientes nuevos por ano y cohortes retenidas anualmente. No sustituye el forecast comercial real.

### Costo externo operativo pagado por clientes antes de churn

| Periodo | Clientes acumulados | Costo mensual total | Costo anual total | Notas |
| --- | --- | --- | --- | --- |
| Ano 1 | 26 | USD 2,834.00/mes | USD 34,008.00/ano | Pagado por el cliente: Chatwoot 19 + n8n 20 + OpenAI 70. |
| Ano 3 | 78 | USD 8,502.00/mes | USD 102,024.00/ano | Pagado por el cliente: Chatwoot 19 + n8n 20 + OpenAI 70. |
| Ano 5 | 130 | USD 14,170.00/mes | USD 170,040.00/ano | Pagado por el cliente: Chatwoot 19 + n8n 20 + OpenAI 70. |

El costo externo indicado por negocio es USD 109/mes por cliente: Chatwoot USD 19, n8n USD 20 y OpenAI USD 70. Ese costo deberia ser asumido o trasladado al cliente como parte de su operacion. No debe confundirse con el costo interno de Simplia por operar el SaaS.

## Costos internos Simplia

Simplia asumiria principalmente Supabase, Vercel, almacenamiento, backups, logs, monitoreo, Edge Functions, mantenimiento del producto y tiempo de soporte. En un modelo pooled estos costos se comparten entre clientes; en un modelo silo se multiplican por cliente.

### Costo interno Simplia estimado para modelo pooled

| Periodo | Base de clientes | Rango interno estimado | Que incluye |
| --- | --- | --- | --- |
| Ano 1 | 26 | 55 a 350/mes | Supabase Pro pequeno/medio, Vercel Pro 1-3 seats, backups exportados simples, monitoreo basico. |
| Ano 3 | 70 a 76 activos aprox. | 120 a 770/mes | Sube almacenamiento, indices, egress, logs, compute y soporte operativo. Aun conviene pooled si hay RLS fuerte. |
| Ano 5 | 106 a 125 activos aprox. | 240 a 1,530/mes | Puede requerir compute mayor, PITR, observabilidad dedicada, particionado y politicas de archivo. |

> Rangos orientativos para decision. La cifra real depende de filas por cliente, archivos, egress, dashboards, retencion de logs y numero de usuarios internos en Vercel/Supabase.

### Modelo de almacenamiento a 5 anos

| Escenario | Supuesto | Ano 1 | Ano 5 | Lectura |
| --- | --- | --- | --- | --- |
| Conservador | 0.5 GB por cliente por ano entre datos, indices y overhead. | 13 GB aprox. | 195 GB aprox. | Supabase pooled sigue siendo barato; el foco es RLS e indices. |
| Medio | 2 GB por cliente por ano. | 52 GB aprox. | 780 GB aprox. | Se requiere gobernar indices, historicos, particionado y backups. |
| Alto | 5 GB por cliente por ano. | 130 GB aprox. | 1.95 TB aprox. | Necesario archivar historicos, revisar PITR, particionar y posiblemente separar analytics. |

> Ano 5 suma cinco cohortes con 1 a 5 anos de datos. La cifra real debe medirse con pg_total_relation_size por tabla.

### Formulas de costo para validar con el equipo

| Componente | Formula orientativa | Decision que habilita |
| --- | --- | --- |
| Costo externo cliente | clientes_activos x USD 109/mes. Incluye Chatwoot 19 + n8n 20 + OpenAI 70 segun supuesto interno. | Separar claramente lo que paga el cliente de lo que asume Simplia. |
| Supabase pooled | plan_base + compute + max(disco_provisionado - 8 GB, 0) x 0.125 + egress_extra + storage_extra + PITR/log drains si aplica. | Proyectar margen interno y saber cuando subir compute o vender enterprise. |
| Supabase por cliente | N clientes x plan/proyecto + compute/disco/egress de cada uno + tiempo humano de migraciones N veces. | Mostrar por que no debe ser el modelo base. |
| Vercel global | seats Pro x USD 20/mes + uso excedente de bandwidth/edge/compute/builds. | Mantener una sola app global y controlar uso. |
| AWS/Azure/GCP | compute 24/7 o serverless + DB gestionada + storage + backups + egress + observabilidad + soporte. | Comparar cuando aparezcan requisitos enterprise o compliance. |
| Bridge/enterprise | costo_base_pooled + entorno dedicado del cliente + margen de soporte + SLA + backups/restores propios. | Definir precio minimo para aceptar aislamiento dedicado. |

Supabase Pro parte desde USD 25/mes segun pricing oficial e incluye 8 GB de disco por proyecto. El disco adicional se cotiza oficialmente desde USD 0.125/GB-mes para gp3. Vercel Pro parte desde USD 20/mes mas uso adicional. En ambos casos, el costo real depende del consumo: egress, compute, storage, logs, usuarios, Edge Functions y retencion.

> **Como leer estos rangos**
>
> Los rangos no son una promesa de factura. Sirven para comparar modelos. La factura real debe medirse con datos: filas por tabla, mensajes por dia, tamano de raw_payload, cantidad de reportes, archivos almacenados, ejecuciones Edge y egress.

## Comparativa completa de alternativas

### Matriz ejecutiva de opciones

| Opcion | Modelo | Ventaja principal | Riesgo principal | Decision recomendada |
| --- | --- | --- | --- | --- |
| Repo + Supabase + Vercel por cliente | Silo completo manual | Aislamiento alto y facil de entender al inicio. | Mantenimiento N veces, versiones divergentes, migraciones repetidas, errores por prompts repetidos. | No usar como estandar. Solo posible para enterprise con precio alto y automatizacion fuerte. |
| Branch por cliente | Fork logico dentro del mismo repo | Permite cambios especificos rapidamente. | Deuda tecnica explosiva, merges permanentes, bugs distintos por cliente. | No usar. Branches solo temporales feature/* o hotfix/*. |
| Un repo + un Vercel + Supabase compartido con company_id | Pool SaaS | Un producto, una version, costos compartidos, onboarding rapido. | Exige RLS, tenant isolation, indices y disciplina de configuracion. | Recomendado como modelo base para SimpliaLeads. |
| Schema por cliente | Pool parcial por proyecto | Aisla nombres y tablas por cliente. | Migrations por schema, duplicacion de tablas, consultas/reportes complejos. | No como base. Usar solo para modulos muy excepcionales. |
| Tablas por cliente | Fragmentacion fisica por tabla | Separacion visible. | Antipattern para SaaS: DDL infinito, codigo condicional, indices duplicados. | Descartar. |
| Supabase/proyecto por cliente | Silo de base/Backend gestionado | Aislamiento de datos fuerte y costo trasladable a enterprise. | Migraciones, backups, secrets y jobs multiplicados. | Modelo bridge/enterprise futuro, no modelo base. |
| Backend unico + DB por cliente | Bridge como los diagramas enviados | Mismo codigo con aislamiento de base. | Routing por tenant, pool de conexiones, migraciones N DBs. | Valido para enterprise si hay equipo DevOps y precio adicional. |
| AWS/Azure/GCP nativo | Cloud enterprise | Control, compliance, redes privadas, escalabilidad avanzada. | Mayor costo y complejidad operativa que Supabase/Vercel. | Evaluar cuando haya requisitos enterprise, no para acelerar 26 clientes/ano. |
| Neon | Postgres serverless | Branching y compute elastico de base de datos. | No reemplaza por si solo Auth, Storage, Edge Functions y RLS operacional de Supabase. | Alternativa DB futura si Supabase limita costos/performance. |
| Railway/Render | PaaS generalista | Rapido para servicios, workers o self-host de n8n. | Menos nativo para Auth/RLS/tenant isolation de producto SaaS. | Complemento posible, no recomendacion principal para core de datos. |

La comparativa se basa en tres dimensiones: velocidad de producto, aislamiento de datos y costo operativo. Para SimpliaLeads, el cuello de botella actual es la repeticion manual y la divergencia de versiones. Por eso, la solucion base debe maximizar una sola version del producto y mover la personalizacion a configuracion.

### Opcion 1 - Repo + Supabase + Vercel por cliente

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Por cada cliente se clona el repositorio, se crea un proyecto Supabase separado y se conecta un proyecto Vercel a su main. |
| GitHub | Habria N repos o N clones. Cada feature debe replicarse manualmente en cada cliente. |
| Vercel | Habria N proyectos/deployments. Cada entorno tiene variables propias y cada release se hace N veces. |
| Supabase/base de datos | Cada cliente tiene su proyecto Supabase. Aislamiento alto, pero sin economia de escala operativa. |
| cw y tablas n8n | Cada cliente mantiene su propio schema cw y sus tablas public/n8n. Las migraciones de cw, automatizaciones y correcciones se repiten por cliente. |
| Beneficios | Aislamiento fuerte, bajo riesgo de fuga entre clientes y facil de razonar en los primeros 1-2 clientes. |
| Limitantes | No escala con 26 clientes/ano; el esfuerzo crece linealmente con clientes y cada feature se vuelve una operacion manual. |
| Riesgos | Versiones divergentes, errores humanos, prompts diferentes, deuda tecnica por cliente, costos y secretos dispersos. |
| Costos aproximados | Supabase Pro desde 25/mes por proyecto si cada cliente requiere Pro, Vercel Pro/uso por entorno, mas tiempo humano. Con 26 clientes podria ser 650/mes solo Supabase base, sin contar compute/egress ni Vercel. |
| Cuando si aplica | Cliente enterprise que paga aislamiento dedicado, contrato especial, SLA propio y presupuesto de mantenimiento. |
| Cuando no aplica | Producto SaaS estandar con 26 clientes nuevos por ano. |

### Opcion 2 - Branch por cliente

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Un repo con una branch permanente por empresa, por ejemplo client/acme, client/empresa-b. |
| GitHub | GitHub parece ordenado al inicio, pero cada cambio global debe mergearse a N branches y resolver conflictos. |
| Vercel | Vercel podria apuntar cada proyecto a una branch distinta, generando deployments por cliente. |
| Supabase/base de datos | Podria usarse una base por cliente o una base compartida, pero el problema de versiones sigue vivo. |
| cw y tablas n8n | Las tablas cw y n8n no quedan normalizadas por producto; cada branch puede esperar columnas o schemas distintos. |
| Beneficios | Permite personalizaciones rapidas y visibilidad por cliente. |
| Limitantes | Convierte el producto en N productos. La branch deja de ser flujo de desarrollo y se vuelve contrato tecnico. |
| Riesgos | Merges imposibles, regresiones distintas, QA N veces, imposibilidad de garantizar que todos tengan la misma seguridad. |
| Costos aproximados | El costo cloud puede no subir mucho al inicio, pero el costo humano explota. Es el peor costo oculto. |
| Cuando si aplica | Pruebas temporales, hotfixes o migraciones controladas con fecha de cierre. |
| Cuando no aplica | Clientes permanentes, features globales o producto SaaS. |

### Opcion 3 - Un repo + un Vercel + Supabase compartido con company_id

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Una sola aplicacion SaaS. Cada fila de negocio tiene company_id. El login resuelve membresia y RLS filtra los datos. |
| GitHub | Un repo. main es produccion, staging/previews para QA, feature/* para desarrollo. No hay ramas por cliente. |
| Vercel | Un Vercel global, por ejemplo dashboard.simplia.com, dashboard.simplia.com/acme o acme.dashboard.simplia.com. |
| Supabase/base de datos | Un proyecto Supabase inicial con schemas app, cw y automation. RLS por company_id y membresia activa. |
| cw y tablas n8n | cw mantiene datos de Chatwoot/dashboard con company_id. n8n pasa a automation con company_id, source y raw_payload. public queda sin datos de negocio. |
| Beneficios | Un producto, releases globales, onboarding rapido, costos compartidos, control de seguridad centralizado, configuracion por empresa. |
| Limitantes | Requiere diseno serio: RLS, indices compuestos, auditoria, pruebas de aislamiento, limites de consumo y observabilidad por tenant. |
| Riesgos | Fuga de datos si RLS falla, noisy neighbor si un cliente consume demasiado, tablas muy grandes si no se particiona/archiva. |
| Costos aproximados | Supabase Pro desde 25/mes mas compute/disco/egress; Vercel Pro desde 20/mes mas uso. Rango interno estimado: 55-350/mes ano 1, 240-1,530/mes ano 5 antes de optimizaciones enterprise. |
| Cuando si aplica | Modelo base recomendado para SimpliaLeads y para 26 clientes nuevos por ano. |
| Cuando no aplica | Clientes con requisitos contractuales de base dedicada, region dedicada o compliance fuerte. |

### Opcion 4 - Schema por cliente dentro del mismo Supabase

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Se crea un schema por cliente: cw_acme, automation_acme, app_acme o similares. |
| GitHub | Un repo, pero el codigo debe construir queries dinamicas por schema o usar clientes con search_path variable. |
| Vercel | Puede seguir siendo un Vercel global. |
| Supabase/base de datos | Un proyecto Supabase, muchos schemas duplicados. La base comparte compute y disco. |
| cw y tablas n8n | Cada cliente tiene copia de las tablas cw y n8n. Las migraciones deben aplicarse a todos los schemas. |
| Beneficios | Mas aislamiento nominal que company_id y facilita borrar/exportar todo un cliente. |
| Limitantes | No elimina el problema de migraciones N veces. Complica tipos, queries, reportes globales y Edge Functions. |
| Riesgos | Schemas olvidados, migraciones parciales, errores de search_path, permisos inconsistentes. |
| Costos aproximados | Menor costo cloud que proyecto por cliente, pero alto costo de mantenimiento. A 130 clientes seria una base con cientos o miles de objetos duplicados. |
| Cuando si aplica | Casos donde un subconjunto de tablas realmente necesita aislamiento fisico dentro de la misma instancia. |
| Cuando no aplica | Modelo base de SaaS con features globales y crecimiento anual constante. |

### Opcion 5 - Tablas por cliente

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Se crean tablas como conversations_acme, conversations_empresa_b o n8n_chat_histories_acme. |
| GitHub | El repo debe generar nombres de tabla dinamicos o duplicar repositorios de consultas. |
| Vercel | Vercel no resuelve el problema; solo despliega el codigo. |
| Supabase/base de datos | Un proyecto con muchas tablas duplicadas por cliente. |
| cw y tablas n8n | cw y n8n se fragmentan por tabla. Reportes multiempresa y migraciones se vuelven muy fragiles. |
| Beneficios | Separacion visual rapida para operadores tecnicos. |
| Limitantes | Es un antipattern: DDL por cliente, indices duplicados, tipos imposibles, codigo complejo. |
| Riesgos | Perdida de consistencia, operaciones manuales, errores de tabla equivocada, costos por indices duplicados. |
| Costos aproximados | Cloud bajo al inicio, costo humano alto y creciente. No recomendable. |
| Cuando si aplica | Practicamente nunca para SaaS. Solo podria servir para dumps temporales o staging de importacion. |
| Cuando no aplica | Producto multiempresa real. |

### Opcion 6 - Proyecto Supabase por cliente

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Mismo producto, pero cada cliente tiene su proyecto Supabase y secrets propios. |
| GitHub | Un repo puede desplegar el mismo codigo, pero se necesita orquestacion de migraciones a N proyectos. |
| Vercel | Puede haber un Vercel global con backend que enrute a proyectos, o un Vercel por cliente. |
| Supabase/base de datos | Aislamiento fuerte por proyecto, pero N instancias, N backups, N secretos, N cron jobs. |
| cw y tablas n8n | Cada proyecto tendria cw y automation propios. Las tablas public de n8n ya no deberian existir sin RLS. |
| Beneficios | Buen aislamiento, buena historia comercial para clientes enterprise, facil exportar/borrar un tenant. |
| Limitantes | Multiplica operacion, monitoreo, migraciones, costos base y soporte. |
| Riesgos | Proyectos desactualizados, secretos expuestos, cron jobs fallidos, falta de visibilidad central. |
| Costos aproximados | Supabase Pro desde 25/mes por cliente si cada uno requiere Pro. Con 26 clientes: desde 650/mes; con 130: desde 3,250/mes antes de uso. |
| Cuando si aplica | Clientes grandes que pagan aislamiento dedicado o requisitos regulatorios. |
| Cuando no aplica | Clientes estandar con margen bajo/medio. |

### Opcion 7 - Backend unico + base de datos por cliente

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | El front y backend son unicos, pero el backend selecciona la base del cliente despues del login. |
| GitHub | Un repo y una version del backend. Migrations deben correr contra cada DB. |
| Vercel | Un Vercel global para front/backend serverless o un backend separado en cloud. Las credenciales de DB nunca van al frontend. |
| Supabase/base de datos | DB dedicada por cliente en Supabase, Neon, RDS, Cloud SQL o Azure SQL. |
| cw y tablas n8n | cw y automation viven completos por DB. Jobs recorren clientes y conectan a cada DB. |
| Beneficios | Combina version unica con aislamiento de datos alto. Es el modelo bridge de los diagramas enviados. |
| Limitantes | Mas complejo que pooled: routing, pool de conexiones, migraciones N DBs, health checks por tenant. |
| Riesgos | Un cliente roto puede requerir rollback propio; alto riesgo operacional si no hay plataforma de provisioning. |
| Costos aproximados | Mas caro que pooled. Puede arrancar en cientos/mes y crecer a miles/mes con 130 clientes si cada DB usa recursos dedicados. |
| Cuando si aplica | Plan enterprise, clientes con alto volumen o necesidad contractual de aislamiento. |
| Cuando no aplica | Primer modelo base sin equipo DevOps dedicado. |

### Opcion 8 - AWS nativo

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Front en CloudFront/Amplify o Vercel, backend en Lambda/ECS/App Runner, DB en RDS/Aurora, storage en S3, colas en SQS. |
| GitHub | Un repo, CI/CD mas robusto, infraestructura como codigo recomendada. |
| Vercel | Vercel puede mantenerse para frontend o migrarse a AWS. |
| Supabase/base de datos | RDS/Aurora Postgres permite pool, silo o bridge. Auth/RLS/app layer debe implementarse con mas piezas. |
| cw y tablas n8n | cw y automation se modelan igual, pero jobs y workers migran a Lambda/EventBridge/SQS. |
| Beneficios | Enterprise grade, redes privadas, compliance, backups, observabilidad y aislamiento avanzados. |
| Limitantes | Mayor complejidad, mas servicios, mas FinOps, mas DevOps. |
| Riesgos | Sobrecosto por arquitectura sobredimensionada y mayor tiempo de implementacion. |
| Costos aproximados | RDS cobra instancia, storage, backups, I/O y red. Un entorno pequeno real puede empezar aprox. 80-300/mes y subir segun HA/volumen. |
| Cuando si aplica | Cuando se necesite compliance, VPC, SLA, clientes enterprise o volumen que justifique equipo cloud. |
| Cuando no aplica | MVP SaaS que necesita lanzar rapido y centralizar producto. |

### Opcion 9 - Azure

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | App Service/Container Apps/Functions con Azure SQL o PostgreSQL Flexible Server, Key Vault, Monitor. |
| GitHub | Un repo con pipelines. Bueno si la empresa ya opera Microsoft. |
| Vercel | Vercel puede continuar o migrarse a Static Web Apps/App Service. |
| Supabase/base de datos | Azure documenta patrones SaaS de base compartida, base por tenant e hibridos. |
| cw y tablas n8n | cw y automation quedan igual a nivel modelo; jobs pueden pasar a Functions/Logic Apps. |
| Beneficios | Muy fuerte para empresas Microsoft, identity corporativa, governance y compliance. |
| Limitantes | Curva de aprendizaje, costos dispersos y mas complejidad que Supabase/Vercel. |
| Riesgos | Sobredimensionar App Service/DB; costos dificiles si no se presupuestan planes e instancias. |
| Costos aproximados | App Service cobra por plan/tier/instancias; DB por compute/storage/backup. Usar calculadora por region. |
| Cuando si aplica | Clientes corporativos Microsoft, SSO/Azure AD, compliance. |
| Cuando no aplica | Primer lanzamiento si el equipo aun esta consolidando producto. |

### Opcion 10 - GCP

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Cloud Run/Functions, Cloud SQL Postgres, Cloud Scheduler, Secret Manager, Cloud Storage, Monitoring. |
| GitHub | Un repo con Cloud Build/GitHub Actions. |
| Vercel | Vercel puede mantenerse o migrarse a Cloud Run/Hosting. |
| Supabase/base de datos | Cloud SQL puede usar pooled, silo o bridge. Auth/RLS se implementa con Postgres/app. |
| cw y tablas n8n | cw y automation migran a Postgres; jobs a Scheduler/Run/Functions. |
| Beneficios | Buen serverless, escalado flexible y pricing por uso para compute. |
| Limitantes | Cloud SQL puede ser costoso 24/7; requiere mas arquitectura que Supabase. |
| Riesgos | Egress, conexiones y cold starts mal disenados; sobrecostos por HA. |
| Costos aproximados | Cloud SQL cobra vCPU, memoria, storage y red. Referencia oficial: vCPU y memoria por hora segun region. |
| Cuando si aplica | Cuando se necesite Cloud Run, BigQuery/analytics o equipo con GCP. |
| Cuando no aplica | Cuando Supabase ya cubre Auth, Postgres, Edge y velocidad de producto. |

### Opcion 11 - Neon

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | Postgres serverless con branching, compute autoscaling y storage separado. |
| GitHub | Un repo. Neon seria DB; se necesita backend/auth aparte o conservar Supabase para auth. |
| Vercel | Vercel encaja bien con Neon, pero las credenciales deben estar server-side. |
| Supabase/base de datos | DB en Neon. No incluye el mismo paquete integrado de Supabase Auth/Storage/Edge/Data API. |
| cw y tablas n8n | cw y automation pueden vivir como schemas en Neon con company_id; jobs requieren backend propio. |
| Beneficios | Excelente para Postgres, branching, ambientes preview y costos elastico segun compute. |
| Limitantes | Hay que construir o integrar Auth, storage, functions y RLS operacional. |
| Riesgos | Complejidad si se migra antes de que Supabase sea una limitante real. |
| Costos aproximados | Launch usage-based con compute-hour y storage; storage indicado oficialmente a USD 0.35/GB-mes. |
| Cuando si aplica | Futuro si el core necesita Postgres mas flexible y el equipo acepta separar backend. |
| Cuando no aplica | Si se quiere rapidez integrada con Supabase Auth/Edge/RLS ahora. |

### Opcion 12 - Railway/Render

| Criterio | Detalle |
| --- | --- |
| Como funcionaria | PaaS para desplegar servicios, workers, APIs o Postgres gestionado de forma sencilla. |
| GitHub | Un repo y despliegues simples. |
| Vercel | Puede reemplazar o complementar Vercel, pero Vercel sigue mejor para frontend moderno. |
| Supabase/base de datos | Postgres gestionado disponible, aunque sin el mismo stack Auth/RLS/Edge de Supabase. |
| cw y tablas n8n | cw y automation podrian migrarse, pero se pierde integracion Supabase. |
| Beneficios | Rapido, simple y util para servicios auxiliares o self-host de n8n. |
| Limitantes | Menos alineado con seguridad multiempresa basada en Supabase Auth + RLS. |
| Riesgos | Costos por RAM/CPU/egress y menor governance enterprise. |
| Costos aproximados | Railway Pro desde 20/mes mas RAM/CPU/egress/volumen. Render depende de plan por servicio/base. |
| Cuando si aplica | Servicios auxiliares, prototipos, workers, n8n self-host si se decide salir de n8n Cloud. |
| Cuando no aplica | Core de datos multiempresa con aislamiento fuerte. |

## Politica de producto y personalizaciones

La politica comercial debe decir explicitamente que SimpliaLeads es un producto SaaS con features globales. El cliente no compra un repositorio, una branch ni un Vercel propio; compra acceso al producto. Las diferencias permitidas deben vivir en configuracion por empresa.

- Permitido como configuracion: prompts, plantillas, contexto empresarial, labels, columnas visibles, dashboards visibles, campos personalizados, webhooks, URLs de integracion, horarios, reportes y feature flags.
- Permitido como modulo: funcionalidad reutilizable que puede activarse para uno o varios clientes sin forkear el codigo.
- No permitido como estandar: cambiar codigo solo para un cliente mediante branch permanente.
- Excepcion enterprise: entorno dedicado, base dedicada o deployment aislado con precio, SLA, soporte y mantenimiento adicional.

Si un cliente pide cambiar el nombre de una columna visible, no se debe alterar la columna fisica de base de datos. Se resuelve con traduccion/label de UI en app.dashboard_settings o app.company_settings. El estandar tecnico se mantiene en ingles y snake_case; la presentacion al usuario puede estar en espanol o en el lenguaje comercial de cada cliente.

## Recomendacion final

> **Arquitectura objetivo**
>
> Un repo GitHub, un deployment Vercel global, un proyecto Supabase compartido inicialmente, schemas app/cw/automation, company_id en toda tabla de negocio, RLS por membresia activa, roles por empresa y configuracion por tenant.

Esta opcion se adapta mejor porque equilibra velocidad, costo y escalabilidad. Permite vender 26 clientes nuevos por ano sin que cada cliente duplique el ciclo de desarrollo. Tambien preserva una ruta enterprise: si un cliente paga aislamiento adicional, se puede mover a un proyecto/base dedicado manteniendo el mismo codigo.

- Primero: reestructurar el dashboard para multiempresa.
- Segundo: mover tablas operativas fuera de public y agregar company_id.
- Tercero: activar RLS real y pruebas automaticas de aislamiento.
- Cuarto: transformar prompts, plantillas e integraciones en configuracion por empresa.
- Quinto: definir contrato comercial de features globales y enterprise dedicado como excepcion.

### Gates para pasar de pooled a bridge/enterprise

| Condicion | Respuesta recomendada | Por que |
| --- | --- | --- |
| Cliente exige base dedicada por contrato | Ofrecer plan enterprise con Supabase/DB dedicada. | Es requisito comercial/legal, no una preferencia tecnica. |
| Cliente supera umbral de volumen o afecta performance | Moverlo a bridge o aislar recursos de lectura/analytics. | Evita noisy neighbor sin cambiar el producto para todos. |
| Requiere region, backup, RPO/RTO o compliance distinto | Entorno dedicado con SLA y costo separado. | El pooled no debe cargar requisitos especiales de un solo cliente. |
| Pide custom code no reusable | Convertir a modulo pago o enterprise dedicado; no branch permanente. | Protege el producto global y evita forks encubiertos. |
| Necesita integraciones muy sensibles | Secrets y workers dedicados, pero manteniendo repo unico. | Aisla riesgo sin duplicar la logica del dashboard. |

## Riesgos, limites y mitigaciones

### Riesgos principales y mitigacion

| Riesgo | Impacto | Mitigacion requerida |
| --- | --- | --- |
| Fuga de datos entre empresas | Critico | RLS por company_id, pruebas automaticas de aislamiento, policies revisadas y service_role solo en Edge Functions. |
| Personalizaciones convertidas en forks | Alto | Contrato: features globales; cambios por configuracion, feature flags o modulo pago. |
| Noisy neighbor | Medio/Alto | Usage events por company_id, limites por tenant, indices, rate limits y plan enterprise dedicado si supera umbrales. |
| Crecimiento de storage 5 anos | Medio/Alto | Particionado por fecha/company_id, retencion de logs, archivo frio y monitoreo de disk growth. |
| Dependencia n8n | Medio | Webhooks idempotentes, colas, error logs por company_id y plan de migrar automatizaciones criticas a codigo. |
| Secrets en frontend | Critico | Eliminar tokens VITE_* de clientes; las integraciones viven en app.company_integrations y se usan server-side. |

## Fuentes oficiales consultadas

### Fuentes

| Fuente | URL | Uso en el documento |
| --- | --- | --- |
| Supabase Pricing | https://supabase.com/pricing | Pro desde USD 25/mes, 8 GB de disco incluidos por proyecto, excedente de disco desde USD 0.125/GB-mes, egress y storage con overage, daily backups en Pro. |
| Supabase Row Level Security | https://supabase.com/docs/guides/database/postgres/row-level-security | RLS debe estar habilitado en tablas de schemas expuestos y se usa para reglas granulares de autorizacion. |
| Supabase Hardening Data API | https://supabase.com/docs/guides/database/hardening-data-api | El schema public suele estar expuesto por la Data API; las tablas accesibles por API deben tener RLS y se recomiendan schemas privados para datos internos. |
| Supabase Database Size | https://supabase.com/docs/guides/platform/database-size | El uso de disco incluye datos, indices, WAL y archivos internos; en Pro el disco puede autoescalar y hay riesgo de modo read-only si se supera la capacidad. |
| Supabase Backups | https://supabase.com/docs/guides/platform/backups | Daily backups y PITR dependen del plan y de la retencion; PITR se cotiza adicionalmente. |
| Vercel Pricing | https://vercel.com/pricing | Pro desde USD 20/mes, incluye credito de uso y cobra consumo adicional por compute, edge requests, transferencia y otros recursos. |
| AWS SaaS Lens - Silo, Pool and Bridge | https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/silo-pool-and-bridge-models.html | Define los modelos SaaS silo, pool y bridge para aislamiento y eficiencia multi-tenant. |
| AWS RDS for PostgreSQL Pricing | https://aws.amazon.com/rds/postgresql/pricing/ | RDS cobra por instancia, almacenamiento, backups, I/O y transferencia segun region y configuracion. |
| Azure SaaS Tenancy Patterns | https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns | Describe patrones de tenancy para apps SaaS, incluyendo base compartida, base por tenant y modelos hibridos. |
| Azure App Service Costs | https://learn.microsoft.com/en-us/azure/app-service/overview-manage-costs | App Service se cobra por plan, tier, instancias y recursos relacionados. |
| Google Cloud SQL Pricing | https://cloud.google.com/sql/pricing | Cloud SQL se cobra por vCPU, memoria, almacenamiento, backups y red segun region y configuracion. |
| Neon Pricing | https://neon.com/pricing | Neon cobra por compute-hour, storage, time-travel/restore y transferencia segun plan. |
| Railway Pricing | https://docs.railway.com/reference/pricing/plans | Railway cobra plan base y uso de RAM, CPU, egress y volumen; Pro desde USD 20/mes mas uso. |
| Render Pricing | https://render.com/pricing/ | Render cobra servicios y bases de datos por plan/recurso, util como opcion PaaS pero menos integrada que Supabase para Auth/RLS/Edge. |
| n8n Pricing | https://n8n.io/pricing/ | Referencia oficial para planes cloud/self-hosted; el documento usa el supuesto comercial indicado: USD 20/mes por cliente. |
| Chatwoot Pricing | https://www.chatwoot.com/pricing/ | Startups desde USD 19/agente/mes facturado anualmente; el documento usa USD 19/mes por cliente como supuesto operativo. |
| OpenAI API Pricing | https://openai.com/api/pricing/ | La facturacion API depende de modelo y tokens; el documento usa el supuesto interno indicado: USD 70/mes por cliente. |
