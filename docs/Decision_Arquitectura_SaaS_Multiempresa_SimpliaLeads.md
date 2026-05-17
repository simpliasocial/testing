# Decision de arquitectura SaaS multiempresa para SimpliaLeads

Fecha de elaboracion: 2026-05-14  
Producto analizado: dashboard SimpliaLeads / Simplia Chatbot / Chatwoot + Supabase + n8n  
Objetivo: decidir una arquitectura escalable para operar multiples empresas sin clonar repositorios ni rehacer features cliente por cliente.

---

## 1. Resumen ejecutivo

El modelo actual de operacion no escala: clonar el repositorio por negocio, crear un Supabase nuevo por negocio y repetir cambios por prompts o iteraciones manuales hace que cada feature nuevo se vuelva trabajo multiplicado. Con 2 clientes puede parecer manejable; con 5 ya se vuelve riesgoso; con 20 clientes nuevos por anio se vuelve inviable.

La recomendacion principal es convertir SimpliaLeads en un SaaS multiempresa real:

- Un solo repositorio.
- Un solo producto versionado.
- Un despliegue principal.
- Features globales para todos.
- Configuracion por empresa.
- Datos aislados por `company_id` y Row Level Security.
- Opcion dedicada solo para clientes enterprise o regulados.

La decision no debe ser "Supabase porque ya lo tenemos". La evaluacion completa muestra que Supabase sigue siendo la mejor opcion inicial para el contexto actual porque ya concentra Postgres, Auth, RLS, Edge Functions, cron/extensiones y velocidad de desarrollo. Sin embargo, hay que disenarlo correctamente desde ahora para que luego pueda evolucionar a un modelo hibrido: clientes normales en infraestructura compartida y clientes grandes en infraestructura dedicada si el contrato lo justifica.

El punto mas critico no es solo costo. Es gobierno del producto. Si cada cliente puede pedir cambios de codigo, nombres fisicos de columnas, tablas propias o dashboards distintos, deja de ser SaaS y se convierte en agencia de software a medida. La regla recomendada es:

> Codigo global, schema global, features globales; configuracion por empresa para prompts, plantillas, etiquetas, campos visibles, webhooks, reglas y permisos.

---

## 2. Problema actual

Actualmente el flujo operativo tiende a ser:

1. Se clona el repositorio.
2. Se crea una cuenta/proyecto Supabase por negocio.
3. Se despliega un Vercel apuntando a `main` o a una variante del repo.
4. Se configuran variables de entorno para ese negocio.
5. Si aparece un nuevo feature, se replica manualmente en cada clon.
6. Si hubo iteraciones por prompts en un cliente, se intenta repetir la misma idea en los otros.

Esto introduce cinco problemas graves.

### 2.1 Mantenimiento multiplicado

Cada feature, fix de seguridad, cambio de UI, migracion SQL o ajuste de sync debe repetirse por cliente. El costo operativo crece linealmente con el numero de empresas.

Con 2 clientes: manejable.  
Con 5 clientes: alto riesgo de errores.  
Con 20 clientes nuevos por anio: inviable.  
Con 100 clientes activos en 5 anios: imposible sin automatizacion seria.

### 2.2 Versiones divergentes

Si cada cliente tiene su propio repo, branch o prompt historico, tarde o temprano cada instancia queda en una version distinta. Eso genera:

- Bugs que solo existen en un cliente.
- Features que estan en un cliente pero no en otro.
- Migraciones que se aplicaron a medias.
- Dificultad para soporte.
- Imposibilidad de medir el producto como uno solo.

### 2.3 Seguridad inconsistente

Al inspeccionar el proyecto actual se detecta un riesgo fuerte: existen tablas en `public` sin RLS, entre ellas `n8n_followups_sent`, `scheduled_appointments`, `citas_agendadas`, `n8n_chat_histories` y `dashboard_tag_settings`. En Supabase, cualquier tabla en un schema expuesto debe tener RLS si se accede desde el navegador con anon/auth keys.

Ademas, varias politicas en `cw` son demasiado permisivas (`using (true)` / `with check (true)` para usuarios autenticados). Eso puede funcionar en un proyecto de un solo cliente, pero no en SaaS multiempresa.

### 2.4 Credenciales y entorno por cliente

El codigo actual usa variables como `VITE_CHATWOOT_ACCOUNT_ID`, `VITE_CHATWOOT_API_TOKEN` y una configuracion unica de Supabase/Chatwoot. Eso implica un cliente por build/deploy. En SaaS, esas credenciales no deben estar en variables frontend ni estar acopladas a un solo cliente.

### 2.5 Personalizaciones mal ubicadas

Un cliente puede pedir "cambiame esta columna porque no la entiendo". Si eso se resuelve cambiando el nombre fisico de la columna en la base, se rompe el producto global. Lo correcto es tener nombres fisicos canonicos en ingles y permitir alias visibles por empresa en la UI.

---

## 3. Vision objetivo

La vision correcta para el producto es:

- SimpliaLeads como SaaS B2B multiempresa.
- Cada empresa entra con sus usuarios.
- Cada usuario pertenece a una o varias empresas.
- Cada empresa tiene sus datos, integraciones, prompts y reglas.
- El equipo de Simplia administra empresas desde un panel interno.
- Las features se publican una sola vez.
- La configuracion permite adaptar el uso por cliente sin crear forks.

Ejemplo:

- `empresa_a` tiene sus leads, chats, etiquetas, prompts, reportes y usuarios.
- `empresa_b` tiene lo mismo, pero no ve nada de `empresa_a`.
- El codigo es el mismo.
- La base fisica es la misma en el modelo recomendado.
- La diferencia esta en `company_id`, permisos y configuracion.

---

## 4. Principio de producto: configurable, no fork

La regla recomendada para contrato y operacion es:

> SimpliaLeads no vende dashboards hechos a medida por cliente. Vende un producto configurable.

Esto no significa que todos los clientes vean exactamente lo mismo. Significa que las diferencias permitidas se expresan como datos/configuracion, no como codigo duplicado.

### Permitido como configuracion por empresa

- Nombre visible de la empresa.
- Logo y branding moderado.
- Labels/etiquetas de negocio.
- Alias visibles de columnas.
- Campos dinamicos requeridos por flujo.
- Prompts del bot.
- Plantillas de respuesta.
- Webhooks n8n o backend.
- Reglas de asignacion.
- Horarios.
- Reportes programados.
- Canales Chatwoot.
- Integraciones activas.
- Roles de usuarios.
- Feature flags por plan.

### No recomendado como personalizacion normal

- Cambiar nombres fisicos de columnas por cliente.
- Crear tablas distintas por cliente.
- Crear branches por cliente.
- Cambiar calculos core sin versionarlos como feature global.
- Alterar el schema solo para un cliente.
- Tener una app Vercel distinta por cliente como regla general.
- Mantener prompts manuales para replicar cambios.

### Excepcion enterprise

Un cliente grande o regulado podria pagar un despliegue dedicado, pero debe tratarse como plan enterprise con:

- Costo adicional.
- SLA separado.
- Mantenimiento separado.
- Migraciones controladas.
- Misma base de codigo, no fork libre.

---

## 5. Opciones de arquitectura evaluadas

### Opcion A: clonar repo + Supabase por cliente

Descripcion: cada cliente tiene su propio repositorio o fork, su propio Supabase y su propio Vercel.

Ventajas:

- Rapido para pilotos.
- Aislamiento fuerte por defecto.
- Si un cliente rompe algo, no afecta a otros.
- Mentalmente simple al inicio.

Desventajas:

- No escala operativamente.
- Cada feature debe replicarse.
- Cada migracion debe repetirse.
- Se generan versiones divergentes.
- El costo de soporte crece por cliente.
- Es facil olvidar aplicar fixes de seguridad.
- No hay vision de producto unico.
- Los prompts/cambios manuales producen inconsistencias.

Riesgo principal: convertir el producto en una coleccion de proyectos independientes imposibles de mantener.

Veredicto: descartada como modelo base. Solo sirve para demos o pilotos temporales.

---

### Opcion B: branch/deploy por empresa

Descripcion: un solo repo, pero cada empresa vive en una branch, deployment o proyecto Vercel diferente.

Ventajas:

- Evita duplicar el repositorio completo.
- Permite diferencias por cliente.
- Parece ordenado al inicio.

Desventajas:

- Las branches de cliente se vuelven forks encubiertos.
- Los merges se vuelven peligrosos.
- Cada hotfix requiere revisar N branches.
- La configuracion queda mezclada con codigo.
- Vercel se vuelve una matriz de deployments dificil de gobernar.

Veredicto: no recomendado. Las branches deben representar trabajo de desarrollo, no clientes.

Uso correcto de branches:

- `main`: produccion.
- `develop` o `staging`: validacion.
- `feature/*`: trabajo temporal.
- Nunca `cliente-a`, `cliente-b`, `cliente-c` como modelo permanente.

---

### Opcion C: schema por empresa en el mismo Supabase

Descripcion: un solo proyecto Supabase, pero cada empresa tiene un schema propio: `cw_empresa_a`, `cw_empresa_b`, etc.

Ventajas:

- Separacion visual clara.
- Menor mezcla de datos.
- Facil explicar a personas no tecnicas.
- Puede aislar permisos por schema.

Desventajas:

- Duplica migraciones por schema.
- Cada tabla existe N veces.
- El codigo debe resolver schema dinamico.
- PostgREST/Supabase API complica schemas expuestos.
- Consultas globales son mas dificiles.
- Indices y cambios se multiplican.
- No elimina el problema de mantenimiento, solo lo mueve.

Riesgo principal: terminar aplicando la misma migracion 100 veces cuando haya 100 empresas.

Veredicto: no recomendado como modelo base para este caso. Puede servir para casos enterprise muy aislados, pero no para SaaS general.

---

### Opcion D: tablas por empresa

Descripcion: crear tablas como `conversations_empresa_a`, `conversations_empresa_b`.

Ventajas:

- Visualmente separa datos.
- Facil de entender superficialmente.

Desventajas:

- Es el peor modelo para migraciones.
- Rompe consultas genericas.
- Rompe indices globales.
- Rompe reportes globales.
- Aumenta mucho el codigo condicional.
- No es un patron sano de SaaS.

Veredicto: descartada.

---

### Opcion E: una base compartida con `company_id` + RLS

Descripcion: todas las tablas de negocio tienen `company_id`. Las politicas RLS garantizan que cada usuario solo vea filas de sus empresas.

Ventajas:

- Un solo producto.
- Una sola migracion por feature.
- Una sola app.
- Un solo modelo de datos.
- Menor costo por cliente.
- Facil crear nuevas empresas.
- Permite reportes internos globales.
- Permite configuracion por empresa.
- Escala bien hasta decenas o cientos de clientes si se indexa y particiona correctamente.

Desventajas:

- Requiere disenar seguridad bien desde el inicio.
- Un error de RLS puede exponer datos entre empresas.
- Puede aparecer "noisy neighbor": un cliente grande consume recursos compartidos.
- Restaurar un solo cliente a un punto anterior es mas dificil que restaurar una base dedicada.
- Requiere observabilidad por `company_id`.

Riesgo principal: seguridad mal implementada. Se mitiga con RLS, tests de aislamiento, auditoria y servicio backend para operaciones sensibles.

Veredicto: opcion recomendada para SimpliaLeads como SaaS base.

---

### Opcion F: proyecto/base por empresa, pero codigo unico

Descripcion: un solo repo y una sola version de codigo, pero cada empresa tiene su propio proyecto Supabase o base Postgres.

Ventajas:

- Aislamiento fuerte.
- Restauracion por cliente sencilla.
- Menos riesgo de fuga entre clientes.
- Bueno para clientes regulados.

Desventajas:

- Migraciones deben correr en multiples bases.
- Costos suben por cliente.
- Observabilidad y soporte se multiplican.
- Onboarding requiere provisionamiento mas complejo.
- No es eficiente para clientes medianos/pequenos.

Veredicto: no recomendado como base, pero si como plan enterprise.

---

### Opcion G: modelo hibrido / bridge

Descripcion: clientes normales viven en una base compartida; clientes grandes pueden vivir en infraestructura dedicada. El codigo sigue siendo el mismo.

Ventajas:

- Permite iniciar simple y escalar.
- Mantiene eficiencia para la mayoria.
- Permite vender enterprise sin reescribir producto.
- Reduce riesgo de noisy neighbor.
- Permite aislar clientes con requisitos fuertes.

Desventajas:

- Requiere catalogo de tenants.
- Requiere automatizar provisionamiento.
- Requiere migraciones multi-target para clientes dedicados.
- Requiere monitoreo por deployment.

Veredicto: recomendacion de evolucion. Base pooled ahora; bridge cuando haya clientes que lo paguen.

---

## 6. Comparativa de plataformas

### 6.1 Supabase

Supabase ofrece Postgres administrado, Auth, APIs automaticas, RLS, Storage, Edge Functions, Vault/extensiones y un flujo rapido para equipos pequenos.

Por que encaja:

- El proyecto ya esta construido sobre Supabase.
- El dominio necesita datos relacionales.
- Se requiere RLS fuerte por empresa.
- El dashboard ya consulta desde frontend.
- Las Edge Functions actuales ya sincronizan Chatwoot.
- El equipo puede moverse rapido sin armar infraestructura desde cero.

Riesgos:

- Si se deja el frontend acceder a tablas sin RLS, hay riesgo critico.
- Si se usa `service_role` fuera del backend, es peligroso.
- Si se guarda todo el historial crudo por 5 anios sin particionar/archivar, la base puede crecer mucho.
- Si se usa un solo proyecto para todos sin monitoreo por empresa, puede haber noisy neighbor.
- Planes Team/Enterprise pueden ser necesarios si se requieren SLA, SSO de dashboard Supabase, compliance o soporte avanzado.

Costos base segun pricing oficial:

- Pro desde USD 25/mes.
- Incluye 100k MAU, 8 GB de disco por proyecto y 250 GB de egress.
- Disco adicional gp3 referencial: USD 0.125/GB-mes.
- Supabase documenta que RLS debe estar habilitado en schemas expuestos, especialmente `public`.

Veredicto: recomendado como plataforma inicial, con redisenio multiempresa y seguridad.

---

### 6.2 Vercel

Vercel es adecuado para frontend React/Vite y despliegue rapido desde GitHub.

Por que encaja:

- El proyecto ya usa Vercel.
- El dashboard es frontend-heavy.
- CI/CD desde GitHub es simple.
- Un solo deployment puede servir a muchas empresas.
- Permite previews por PR para validar features.

Riesgos:

- No debe crearse un Vercel por cliente como modelo base.
- Si se migran APIs pesadas a Vercel Functions sin control, puede subir el costo.
- Si los secretos de integraciones se exponen como `VITE_*`, quedan disponibles al navegador.

Costos base:

- Pro desde USD 20/mes + uso adicional.
- Incluye credito de uso y cobro adicional segun recursos.

Veredicto: mantener para frontend. Usar Vercel para app global, no por empresa.

---

### 6.3 AWS

Arquitectura posible:

- Frontend: CloudFront + S3 o Amplify.
- Backend: Lambda / API Gateway / ECS Fargate.
- DB: RDS PostgreSQL o Aurora PostgreSQL.
- Auth: Cognito.
- Jobs: EventBridge Scheduler.
- Secrets: Secrets Manager.
- Observabilidad: CloudWatch.
- Archival/analytics: S3 + Athena/Redshift.

Ventajas:

- Muy robusto para enterprise.
- Control fino de redes, seguridad y compliance.
- RDS/Aurora pueden escalar muy lejos.
- S3 es excelente para historicos baratos.
- Buen modelo para bridge/silo por tenant.

Desventajas:

- Mucha mas complejidad operativa.
- Requiere DevOps/cloud engineering.
- Cognito puede ser mas rigido en UX.
- No trae la experiencia integrada tipo Supabase.
- El tiempo de implementacion sube.

Costos base segun fuentes oficiales:

- RDS cobra por instancia, storage, backups, I/O y transferencia.
- RDS Multi-AZ duplica parte del costo por disponibilidad.
- Lambda tiene free tier y luego cobra por requests y GB-segundo.
- Cognito tiene free tier de MAU, pero features avanzadas y MFA/SMS suman.
- EventBridge Scheduler tiene free tier amplio.

Veredicto: excelente opcion enterprise o etapa 2/3, no la mejor primera opcion para este equipo y producto todavia en evolucion.

---

### 6.4 Azure

Arquitectura posible:

- Frontend: Static Web Apps o App Service.
- Backend: Container Apps, Functions o App Service.
- DB: Azure Database for PostgreSQL Flexible Server.
- Auth: Microsoft Entra External ID.
- Secrets: Key Vault.
- Observabilidad: Azure Monitor.

Ventajas:

- Muy buena si los clientes objetivo son corporativos/Microsoft.
- Entra External ID tiene un enfoque fuerte para identidad B2B/B2C.
- PostgreSQL Flexible Server permite tiers burstable/general/memory optimized.
- Key Vault es maduro para secretos.
- Azure documenta patrones SaaS multitenant, database-per-tenant e hibridos.

Desventajas:

- Mayor complejidad que Supabase.
- Experiencia de desarrollo menos directa para este repo actual.
- Se requiere construir APIs, Auth/RLS o middleware de permisos.
- Migrar ahora retrasaria el producto.

Costos:

- Azure recomienda usar Pricing Calculator para PostgreSQL Flexible Server.
- Entra External ID Basic incluye primeros 50k MAU sin costo, segun pricing oficial.
- Container Apps cobra por consumo de vCPU/memoria/requests.
- Key Vault cobra por operaciones.

Veredicto: opcion valida si la estrategia comercial apunta a clientes Microsoft/enterprise. No recomendada como migracion inmediata salvo decision corporativa.

---

### 6.5 Google Cloud

Arquitectura posible:

- Frontend: Firebase Hosting / Cloud Run / Cloud CDN.
- Backend: Cloud Run.
- DB: Cloud SQL PostgreSQL.
- Auth: Identity Platform/Firebase Auth.
- Secrets: Secret Manager.
- Jobs: Cloud Scheduler.
- Analytics: BigQuery.

Ventajas:

- Cloud Run es muy bueno para servicios containerizados.
- BigQuery es fuerte para analytics historico.
- Identity Platform tiene pricing por MAU y free tier.
- Buena opcion si el producto se vuelve fuertemente analitico.

Desventajas:

- Menos integrado que Supabase para este caso.
- Cloud SQL + Auth + APIs + RLS deben ensamblarse.
- Requiere mas arquitectura backend.
- Migrar ahora tiene costo alto.

Costos:

- Cloud SQL cobra por instancia, storage, backups y egress.
- Cloud Run cobra por CPU/memoria/requests.
- Identity Platform tiene 50k MAU free para proveedores tier 1 segun pricing oficial.

Veredicto: fuerte para analytics/AI a escala, pero no mejor opcion inicial.

---

### 6.6 Neon

Neon es Postgres serverless/autoscaling con branching.

Ventajas:

- Muy buen Postgres administrado.
- Autoscaling y branching son atractivos para desarrollo.
- Pricing por compute/storage puede ser eficiente en cargas variables.
- Puede funcionar bien con Vercel.

Desventajas:

- No reemplaza todo Supabase.
- Necesitariamos Auth, Storage, Edge Functions y APIs por separado.
- RLS existe por Postgres, pero el stack alrededor hay que construirlo.
- El equipo perderia integracion actual de Supabase.

Costos:

- Launch con gasto tipico bajo, storage alrededor de USD 0.35/GB-mes segun pricing oficial.
- Scale pensado para cargas altas con mas features.

Veredicto: opcion interesante si se quiere Postgres mas especializado y backend propio. No recomendada ahora porque obliga a armar demasiadas piezas.

---

### 6.7 Railway / Render

Ventajas:

- Rapidos para prototipos.
- Buena DX.
- Utiles para servicios auxiliares.

Desventajas:

- No son la opcion mas fuerte para core de datos SaaS B2B con 5 anios de retencion.
- Menos gobierno enterprise.
- Menos madurez para aislamiento/observabilidad/compliance de alto nivel.

Veredicto: utiles para servicios auxiliares, no como plataforma central recomendada.

---

### 6.8 n8n

n8n es valioso para automatizaciones, integraciones y prototipos de flujos.

Ventajas:

- Rapido para iterar flujos.
- Bueno para integraciones externas.
- Permite a no-developers visualizar procesos.
- Puede operar webhooks y tareas programadas.

Riesgos para el core:

- Si se ejecuta un workflow por cada mensaje, el volumen puede explotar.
- Con 100k mensajes/mes por empresa y 20 clientes, serian 2M eventos/mes en anio 1 si cada mensaje dispara n8n.
- Los planes cloud publicos de n8n estan pensados por ejecuciones mensuales; para alto volumen se requiere self-host serio, queue mode o enterprise.
- La logica critica queda fuera del control del producto si se reparte en workflows manuales.

Costos oficiales:

- Starter: 20 EUR/mes anual, 2.5k ejecuciones.
- Pro: 50 EUR/mes anual, 10k ejecuciones.
- Business: 667 EUR/mes anual, 40k ejecuciones.
- Enterprise: custom.

Veredicto: mantener n8n en transicion, onboarding e integraciones puntuales. No usar n8n como motor principal por mensaje cuando el volumen crezca. El core conversacional y reglas criticas deben pasar gradualmente a backend propio.

---

### 6.9 Chatwoot

Chatwoot es la fuente operacional del contact center.

Ventajas:

- Ya esta integrado.
- Permite canales, conversaciones, agentes y etiquetas.
- El dashboard se beneficia de sincronizar historico desde Chatwoot.

Riesgos:

- Retencion en planes Cloud puede ser limitada frente a la vision de 5 anios.
- Si cada cliente tiene su propia cuenta Chatwoot, hay que registrar credenciales por empresa.
- El token de Chatwoot nunca debe estar en frontend.

Costos oficiales Cloud:

- Startups: USD 19/agente/mes anual.
- Business: USD 39/agente/mes anual.
- Enterprise: USD 99/agente/mes anual.

Veredicto: mantener como sistema operacional, pero SimpliaLeads debe ser el data warehouse/analytics layer y conservar historico propio.

---

## 7. Recomendacion final

### Decision recomendada

Construir SimpliaLeads como SaaS multiempresa en Supabase + Vercel, con modelo pooled:

- Una base compartida.
- `company_id` en todas las tablas de negocio.
- RLS estricto por membresia.
- Configuracion por empresa.
- Backend/Edge Functions para secretos e integraciones.
- Vercel como frontend global.
- n8n solo como integracion/transicion, no como core de alto volumen.
- Evolucion a modelo bridge para clientes enterprise.

### Por que esta opcion es la mejor ahora

Porque equilibra velocidad, costo, seguridad y escalabilidad. El producto todavia esta evolucionando; migrar ahora a AWS/Azure/GCP completo agregaria mucha complejidad antes de tener el modelo de producto estable. Supabase permite corregir la arquitectura actual sin reescribir todo.

### Que no se debe hacer

- No crear un repo por empresa.
- No crear una branch por empresa.
- No crear un Vercel por empresa como base.
- No crear schemas/tablas por empresa como norma.
- No permitir cambios fisicos de columnas por cliente.
- No guardar tokens de Chatwoot/n8n en variables `VITE_*`.
- No dejar tablas `public` sin RLS.

---

## 8. Modelo de datos recomendado

### 8.1 Tablas SaaS base

Estas tablas deben existir para convertir el sistema en SaaS:

- `companies`
- `company_members`
- `company_roles`
- `company_settings`
- `company_feature_flags`
- `integration_connections`
- `integration_secrets`
- `automation_webhooks`
- `prompt_templates`
- `message_templates`
- `custom_field_definitions`
- `audit_logs`
- `usage_events`

### 8.2 Reglas de `company_id`

Toda tabla que tenga datos de cliente debe incluir `company_id`.

Ejemplos:

- `cw.conversations_current.company_id`
- `cw.contacts_current.company_id`
- `cw.messages.company_id`
- `cw.inboxes.company_id`
- `cw.attribute_definitions.company_id`
- `cw.automated_reports.company_id`
- `cw.dashboard_tag_settings.company_id`
- `cw.import_batches.company_id`
- `cw.import_batch_errors.company_id`
- tablas n8n migradas: `automation_error_logs.company_id`, `chat_histories.company_id`, `scheduled_appointments.company_id`

### 8.3 Indices minimos

Cada tabla grande debe tener indices compuestos por empresa y fecha/id.

Ejemplos:

- `(company_id, created_at_chatwoot desc)`
- `(company_id, last_activity_at_chatwoot desc)`
- `(company_id, chatwoot_conversation_id)`
- `(company_id, chatwoot_message_id)`
- `(company_id, status)`
- `(company_id, chatwoot_inbox_id)`
- `(company_id, event_source, occurred_at desc)`

Sin estos indices, las consultas de una empresa pueden escanear datos de todas.

### 8.4 Particionado

Con 20 clientes nuevos por anio y 100k mensajes/mes por cliente, el crecimiento de `messages` sera alto.

Recomendacion:

- Particionar tablas de eventos/mensajes por tiempo.
- Usar particiones mensuales o trimestrales para `messages`, `chat_histories`, `audit_logs`, `usage_events`.
- Mantener `company_id` en todas las particiones.
- Crear politicas de retencion/archivo por fecha.

### 8.5 Historico y archivo

Retener 5 anios completos dentro de Postgres puede ser costoso si se guarda todo el `raw_payload`.

Recomendacion:

- Mantener en Postgres lo necesario para dashboard operacional y reportes.
- Guardar payloads crudos pesados en Storage/S3/GCS como JSON/Parquet.
- Mantener metricas agregadas diarias/mensuales.
- Archivar mensajes antiguos si no se consultan frecuentemente.

No se recomienda borrar historico sin estrategia; el valor del producto es justamente analitica longitudinal.

---

## 9. Modelo de autenticacion y roles

### Roles recomendados

1. `platform_admin`
   - Equipo interno Simplia.
   - Puede crear empresas, ver estado global, configurar integraciones, auditar.

2. `company_admin` o `manager`
   - Gerencia del cliente.
   - Puede ver dashboard, reportes, usuarios de su empresa, configuraciones permitidas.

3. `operator`
   - Usuario operativo.
   - Puede trabajar colas, actualizar leads, ver lo necesario para su operacion.

### No recomendado

No usar emails hardcodeados para roles:

- `admin@simplia.com`
- `test@simplia.com`

Eso sirve en demo, pero no en SaaS.

### Modelo correcto

`auth.users` mantiene identidad.  
`company_members` define pertenencia y rol.

Ejemplo conceptual:

```sql
company_members (
  id uuid primary key,
  company_id uuid not null references companies(id),
  user_id uuid not null references auth.users(id),
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
)
```

Las politicas RLS consultan membresia activa.

---

## 10. Modelo RLS recomendado

Toda tabla de negocio debe tener RLS.

Patron conceptual:

```sql
exists (
  select 1
  from company_members cm
  where cm.company_id = table.company_id
    and cm.user_id = auth.uid()
    and cm.is_active = true
)
```

Para `platform_admin`, se puede:

- Usar una tabla interna `platform_admins`.
- Usar custom claims verificados.
- O hacer operaciones administrativas solo desde backend con service role.

Recomendacion:

- El navegador solo usa anon/auth key.
- La base protege con RLS.
- El service role solo vive en backend/Edge Functions.
- Operaciones peligrosas pasan por backend.

---

## 11. Como se manejarian las empresas

### Alta de empresa

Flujo:

1. `platform_admin` crea empresa en `companies`.
2. Se crea configuracion inicial en `company_settings`.
3. Se registran integraciones en `integration_connections`.
4. Los secretos se guardan en Vault/Secrets/backend, no en frontend.
5. Se invita a usuarios.
6. Se asignan roles.
7. Se dispara sync inicial de Chatwoot.
8. El dashboard queda disponible para esa empresa.

### Usuario con una empresa

Al iniciar sesion:

1. Auth identifica al usuario.
2. App consulta empresas disponibles via RLS.
3. Si solo tiene una empresa, entra directo.
4. Todas las consultas quedan filtradas por esa empresa.

### Usuario con varias empresas

Debe haber selector de empresa activa.

La empresa activa se guarda:

- En estado frontend.
- En URL si conviene: `/companies/:companySlug/dashboard`.
- En headers o parametros al llamar backend.

RLS sigue siendo la defensa principal.

### Empresa con configuracion propia

Cada empresa puede tener:

- Prompts.
- Plantillas.
- Etiquetas de cola.
- Campos requeridos.
- Webhooks.
- Reportes.
- Canales.
- Alias visuales.

Todo esto vive en tablas de configuracion, no en codigo.

---

## 12. Cambios globales vs cambios por empresa

### Cambios globales

Son features, fixes y mejoras del producto.

Ejemplos:

- Nueva pagina de reportes.
- Nuevo calculo de SLA.
- Mejor exportacion Excel.
- Nuevo modulo de scoring.
- Mejoras de performance.
- Nuevo panel de configuracion.

Estos cambios se despliegan una sola vez y aplican a todos.

### Cambios por empresa permitidos

Son datos/configuracion.

Ejemplos:

- Que la columna `monto_operacion` se muestre como "Monto", "Valor de venta" o "Ticket".
- Que una empresa use la etiqueta `cita_agendada` y otra `booking_confirmed`.
- Que una empresa tenga un prompt diferente.
- Que una empresa tenga una plantilla de WhatsApp diferente.
- Que una empresa pida campos extra al cerrar venta.

### Cambios por empresa no recomendados

Ejemplos:

- Cambiar `monto_operacion` fisicamente a `valor_cliente_x`.
- Crear una tabla `ventas_cliente_x`.
- Cambiar el codigo del funnel solo para un cliente.
- Crear una branch para ese cliente.

Si se necesita algo especial, debe convertirse en:

- Configuracion.
- Feature flag.
- Modulo pago.
- Plan enterprise dedicado.

---

## 13. Estandar de base de datos

### Idioma

Todo nombre fisico debe estar en ingles.

Correcto:

- `scheduled_appointments`
- `chat_histories`
- `error_logs`
- `company_settings`
- `prompt_templates`

Incorrecto:

- `citas_agendadas`
- `N8N_error_Logs`
- `nombre_cliente` si es schema nuevo

### Formato

Usar `snake_case` en minusculas.

Correcto:

- `created_at`
- `updated_at`
- `company_id`
- `chatwoot_conversation_id`

Incorrecto:

- `CreatedAt`
- `companyId`
- `N8N_error_Logs`
- `CWCliente`

### Tipos y convenciones

- IDs internos: `uuid`.
- IDs externos: `chatwoot_*_id`, `n8n_*_id`, etc.
- Fechas: `timestamptz`.
- Booleanos: `is_active`, `has_*`, `should_*`.
- JSON flexible: `jsonb`, pero con definiciones en tablas cuando afecte UI.
- Auditoria: `created_at`, `updated_at`, `created_by`, `updated_by` cuando aplique.

### Traduccion visible

La traduccion debe ocurrir en la capa de UI/configuracion.

Ejemplo:

Fisico:

- `monto_operacion`

Visible:

- Empresa A: "Monto de operacion"
- Empresa B: "Valor estimado"
- Empresa C: "Ticket proyectado"

---

## 14. Tablas actuales y lectura del proyecto

### Schema `cw`

El schema `cw` contiene la parte mas importante del dashboard:

- `conversations_current`
- `contacts_current`
- `messages`
- `inboxes`
- `attribute_definitions`
- `conversation_label_events`
- `automated_reports`
- `dashboard_tag_settings`
- `sync_runs`
- `sync_cursor`
- otras tablas de historico/auditoria.

Estas tablas deben evolucionar a multiempresa agregando `company_id`.

### Schema `public`

Tablas detectadas:

- `n8n_followups_sent`
- `N8N_error_Logs`
- `users`
- `scheduled_appointments`
- `citas_agendadas`
- `n8n_chat_histories`
- `dashboard_tag_settings`

Lectura:

- `dashboard_tag_settings` si es usada por el dashboard como fallback. Debe eliminarse el fallback a `public` y usar solo tabla segura multiempresa.
- Las tablas n8n parecen usadas por automatizaciones externas y deben migrarse o protegerse.
- `citas_agendadas` debe normalizarse a ingles.
- `N8N_error_Logs` debe renombrarse por convencion.
- `public.users` no debe competir con `auth.users`.

Prioridad:

1. Activar RLS y policies correctas.
2. Mover negocio fuera de `public` o cerrar schema expuesto.
3. Normalizar nombres.
4. Agregar `company_id`.
5. Migrar automatizaciones externas.

---

## 15. Flujo de datos recomendado

### Ingreso desde Chatwoot

1. Empresa tiene integracion Chatwoot registrada.
2. Backend obtiene credenciales seguras.
3. Sync job consulta Chatwoot por empresa.
4. Cada fila insertada lleva `company_id`.
5. Mensajes/conversaciones se normalizan.
6. Dashboard consulta datos filtrados por RLS.

### Ingreso desde n8n/webhooks

1. Cada webhook tiene token o firma asociada a una empresa.
2. Backend resuelve `company_id`.
3. Se valida payload.
4. Se escribe en tablas canonicas.
5. Se registra auditoria.

No se recomienda que n8n escriba libremente en tablas sin RLS usando anon key.

### Configuracion de prompts

1. `platform_admin` o `company_admin` edita prompt permitido.
2. Se guarda version en `prompt_templates`.
3. El bot/backend lee prompt activo por empresa.
4. Cada cambio queda versionado.
5. Se puede volver a version anterior.

---

## 16. Estimacion de volumen

Supuesto elegido:

- 20 clientes nuevos por anio.
- Volumen medio por empresa.
- 10k leads/mes por empresa.
- 100k mensajes/mes por empresa.
- Retencion completa: 5 anios.

### Empresas activas

| Momento | Empresas activas |
|---|---:|
| Fin anio 1 | 20 |
| Fin anio 3 | 60 |
| Fin anio 5 | 100 |

### Volumen mensual al cierre de cada etapa

| Momento | Leads/mes | Mensajes/mes |
|---|---:|---:|
| Fin anio 1 | 200k | 2M |
| Fin anio 3 | 600k | 6M |
| Fin anio 5 | 1M | 10M |

### Volumen acumulado por cohortes

Si entran 20 clientes nuevos al inicio de cada anio:

| Momento | Leads acumulados | Mensajes acumulados |
|---|---:|---:|
| Fin anio 1 | 2.4M | 24M |
| Fin anio 3 | 14.4M | 144M |
| Fin anio 5 | 36M | 360M |

### Estimacion de almacenamiento

Escenario realista si se guardan mensajes, metadata y parte de raw payload:

- Conversacion promedio: 4 KB a 15 KB.
- Mensaje promedio: 1.5 KB a 6 KB.
- Indices: +30% a +100%.
- Auditoria/logs/agregados: +10% a +30%.

Resultado orientativo a 5 anios:

- Lean: 1 TB a 1.5 TB.
- Realista: 2 TB a 3 TB.
- Pesado: 4 TB a 6 TB.

Conclusion: el diseno debe contemplar particionamiento y archivo desde el inicio. No conviene guardar todo crudo en tablas calientes indefinidamente.

---

## 17. Costos orientativos

Nota: los costos exactos deben recalcularse con calculators oficiales y metricas reales. Este documento da orden de magnitud y estructura de costo.

### 17.1 Supabase + Vercel recomendado

Componentes:

- Supabase Pro/Team.
- Compute Postgres.
- Storage extra.
- Egress.
- Edge Functions.
- Logs/drains si aplica.
- Vercel Pro.
- n8n transicional o backend propio.
- Chatwoot por cliente/agente si Simplia lo absorbe.

Costos base conocidos:

- Supabase Pro desde USD 25/mes.
- 8 GB incluidos; extra gp3 aprox USD 0.125/GB-mes.
- Vercel Pro desde USD 20/mes + uso.
- n8n Pro 50 EUR/mes anual por 10k ejecuciones.
- Chatwoot Business USD 39/agente/mes anual.

Ejemplo storage Supabase:

| Storage Postgres | Costo extra aprox |
|---:|---:|
| 500 GB | USD 62.50/mes |
| 1 TB | USD 128/mes |
| 2 TB | USD 256/mes |
| 3 TB | USD 384/mes |

Esto es solo storage. Compute, egress, backups, logs y soporte se suman.

Estimacion por etapa:

| Etapa | Costo mensual esperado |
|---|---:|
| Inicio serio / 20 clientes | USD 150 - 600 |
| 60 clientes | USD 500 - 2,000 |
| 100 clientes / 5 anios | USD 1,000 - 5,000+ |

La variacion depende sobre todo de:

- Cuanto raw payload se guarde.
- Cuantas consultas pesadas haga el dashboard.
- Si hay particionamiento.
- Si se archiva historico frio.
- Si n8n procesa cada mensaje.
- Si Chatwoot lo paga Simplia o el cliente.

### 17.2 AWS

Costos principales:

- RDS/Aurora compute.
- Storage y backups.
- Lambda/API Gateway.
- Cognito.
- Secrets Manager.
- CloudWatch.
- S3 para archivo.
- EventBridge.

Estimacion:

- Puede iniciar en cientos de USD/mes.
- Escala a miles/mes segun HA, backups, I/O y logs.
- Con Multi-AZ el costo sube.

Ventaja: control enterprise.  
Riesgo: complejidad y DevOps.

### 17.3 Azure

Costos principales:

- PostgreSQL Flexible Server.
- Container Apps/App Service.
- Entra External ID.
- Key Vault.
- Monitor.
- Storage.

Estimacion:

- Similar a AWS en orden de magnitud.
- Puede ser atractiva si clientes corporativos ya compran Microsoft.

Ventaja: entrada enterprise Microsoft.  
Riesgo: migracion y complejidad.

### 17.4 GCP

Costos principales:

- Cloud SQL.
- Cloud Run.
- Identity Platform.
- Secret Manager.
- Cloud Scheduler.
- BigQuery si se usa analytics.

Estimacion:

- Similar a AWS/Azure para base administrada.
- BigQuery puede ser muy bueno para analitica historica, pero agrega arquitectura.

Ventaja: analytics.  
Riesgo: ensamblar mas piezas.

### 17.5 Neon + Vercel

Costos:

- Storage alrededor de USD 0.35/GB-mes en planes pagos.
- Compute por CU-hour.
- Se necesita Auth/backend aparte.

Con 2 TB de storage, solo storage puede estar alrededor de USD 700/mes antes de compute.

Ventaja: Postgres moderno/autoscaling.  
Riesgo: falta de plataforma integrada.

---

## 18. Riesgos principales y mitigacion

### Riesgo 1: fuga de datos entre empresas

Causa:

- RLS mal definida.
- Queries sin `company_id`.
- Backend usando service role sin validar empresa.

Mitigacion:

- RLS en todas las tablas.
- Tests automaticos de aislamiento.
- `company_id` obligatorio.
- Backend valida membresia.
- Auditoria de accesos.

### Riesgo 2: noisy neighbor

Causa:

- Un cliente grande consume mucho CPU/I/O.

Mitigacion:

- Indices por `company_id`.
- Particionado.
- Rate limits por empresa.
- Usage metering.
- Mover cliente grande a deployment dedicado.

### Riesgo 3: base gigante e inmanejable

Causa:

- Guardar todo crudo en Postgres.

Mitigacion:

- Archivo frio.
- Agregados diarios.
- Particiones.
- Retencion diferenciada para payloads pesados.

### Riesgo 4: n8n como cuello de botella

Causa:

- Workflow por mensaje a gran volumen.

Mitigacion:

- n8n solo orquestacion.
- Core bot/backend en codigo.
- Cola de trabajos.
- Logs estructurados.

### Riesgo 5: personalizaciones infinitas

Causa:

- Vender "lo que el cliente pida" como codigo.

Mitigacion:

- Contrato de producto configurable.
- Feature flags.
- Modulos pagos.
- No forks salvo enterprise.

### Riesgo 6: secretos expuestos

Causa:

- `VITE_CHATWOOT_API_TOKEN` y otros secretos en frontend.

Mitigacion:

- Mover tokens a Vault/Backend.
- Edge Functions con service role.
- Nunca exponer tokens privados al navegador.

### Riesgo 7: migracion incompleta

Causa:

- Mezclar tablas viejas `public` con nuevas multiempresa.

Mitigacion:

- Plan de migracion por fases.
- Backfill controlado.
- Freeze de cambios durante migracion.
- Validacion de conteos.
- Modo read-only temporal para tablas viejas.

---

## 19. Roadmap recomendado

### Fase 0: seguridad inmediata

Objetivo: no escalar sobre una base insegura.

Acciones:

- Revisar todas las tablas `public`.
- Activar RLS donde corresponda.
- Eliminar fallback de `public.dashboard_tag_settings`.
- Mover settings a `cw` o schema seguro.
- Revisar policies `using(true)`.
- Revocar permisos innecesarios a `anon`.
- Revisar funciones `SECURITY DEFINER`.
- Quitar secretos del frontend.

### Fase 1: modelo SaaS base

Acciones:

- Crear `companies`.
- Crear `company_members`.
- Crear roles.
- Crear `company_settings`.
- Crear `integration_connections`.
- Crear `prompt_templates`.
- Crear `custom_field_definitions`.
- Crear `audit_logs`.

### Fase 2: multiempresa en tablas existentes

Acciones:

- Agregar `company_id` a tablas `cw`.
- Backfill empresa actual.
- Crear indices compuestos.
- Crear RLS por membresia.
- Ajustar queries frontend.
- Ajustar Edge Functions.

### Fase 3: configuracion por empresa

Acciones:

- Panel admin Simplia.
- Panel empresa/gerencia.
- Alias visuales de campos.
- Prompts versionados.
- Plantillas.
- Webhooks.
- Feature flags.

### Fase 4: ingestion y automatizacion escalable

Acciones:

- Sync Chatwoot por empresa.
- Webhooks firmados por empresa.
- n8n como transicion.
- Backend propio para alto volumen.
- Queue para eventos.

### Fase 5: performance y archivo

Acciones:

- Particionado de mensajes/eventos.
- Agregados diarios.
- Storage frio.
- Dashboard usa tablas agregadas donde convenga.
- Observabilidad por empresa.

### Fase 6: modelo bridge enterprise

Acciones:

- Catalogo de tenants.
- Provisionamiento dedicado.
- Migraciones multi-target.
- Export/import por empresa.
- SLA separado.

---

## 20. Decision contractual recomendada

Incluir en contrato o propuesta comercial:

1. SimpliaLeads es un producto SaaS.
2. Las mejoras de producto son globales.
3. Las empresas pueden configurar prompts, etiquetas, plantillas, campos visibles, webhooks y reglas.
4. Los cambios de codigo personalizados no forman parte del plan base.
5. Las personalizaciones especiales se cotizan como modulo o plan enterprise.
6. Los nombres fisicos de base de datos son internos y estandarizados.
7. La UI puede adaptar textos visibles por empresa.
8. La retencion de datos y costos operativos deben estar definidos por plan.
9. Integraciones externas pueden tener costos separados.

---

## 21. Decision recomendada final

La mejor solucion para el contexto actual es:

> Supabase + Vercel como plataforma inicial, arquitectura SaaS pooled con `company_id` + RLS, configuracion por empresa, codigo unico, features globales y ruta futura a modelo bridge para enterprise.

No se recomienda migrar inmediatamente a AWS/Azure/GCP porque el producto todavia esta en fase de consolidacion y esa migracion agregaria complejidad antes de resolver lo mas importante: modelo multiempresa, seguridad, configuracion y gobierno de producto.

Si en 12-24 meses el producto crece hacia clientes enterprise, alto volumen o requisitos regulatorios, el modelo debe evolucionar a bridge:

- Empresas normales en infraestructura compartida.
- Clientes grandes en infraestructura dedicada.
- Mismo codigo.
- Mismos schemas.
- Mismas migraciones automatizadas.

---

## 22. Documento siguiente recomendado

Luego de que el equipo elija esta solucion, el siguiente documento debe ser:

`Plan_Implementacion_SaaS_Multiempresa_SimpliaLeads.md`

Ese documento ya no compararia opciones. Debe especificar exactamente como implementar:

- Migraciones SQL.
- Nuevas tablas.
- Politicas RLS.
- Cambios en Auth.
- Cambios en frontend.
- Cambios en Edge Functions.
- Estrategia para n8n.
- Backfill de datos actuales.
- Tests de aislamiento.
- Checklist de rollout.
- Plan de rollback.

---

## 23. Fuentes consultadas

- Supabase Pricing: https://supabase.com/pricing
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Securing your API: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Compute and Disk: https://supabase.com/docs/guides/platform/compute-and-disk
- Vercel Pricing: https://vercel.com/pricing
- AWS RDS PostgreSQL Pricing: https://aws.amazon.com/rds/postgresql/pricing/
- AWS Lambda Pricing: https://aws.amazon.com/lambda/pricing/
- Amazon Cognito Pricing: https://aws.amazon.com/cognito/pricing/
- Amazon EventBridge Pricing: https://aws.amazon.com/eventbridge/pricing/
- AWS SaaS Lens - Core Isolation: https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/core-isolation-concepts.html
- AWS SaaS Lens - Bridge Model: https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/bridge-model.html
- Azure SaaS tenancy patterns: https://learn.microsoft.com/en-us/azure/azure-sql/database/saas-tenancy-app-design-patterns
- Azure PostgreSQL Flexible Server compute: https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-compute
- Microsoft Entra External ID pricing: https://www.microsoft.com/en-us/security/pricing/microsoft-entra-external-id/
- Azure Container Apps pricing: https://azure.microsoft.com/en-us/pricing/details/container-apps/
- Azure Key Vault pricing: https://azure.microsoft.com/en-us/pricing/details/key-vault/
- Google Cloud SQL pricing: https://cloud.google.com/sql/pricing
- Google Cloud Run pricing: https://cloud.google.com/run/pricing
- Google Identity Platform pricing: https://cloud.google.com/identity-platform/pricing
- Neon Pricing: https://neon.com/pricing
- n8n Pricing: https://n8n.io/pricing/
- Chatwoot Pricing: https://www.chatwoot.com/pricing/
