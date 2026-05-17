# Blueprint Tecnico de Implementacion SaaS Multiempresa

SimpliaLeads - GitHub, Vercel, Supabase, roles, schemas, tablas operativas, backups y migracion

| Campo | Valor |
| --- | --- |
| Codigo | SIMPLIA-SAA-IMP-001 |
| Version | 1.0 |
| Estado | Borrador tecnico para planificacion |
| Fecha | 2026-05-14 |
| Zona horaria | America/Guayaquil |
| Responsable | Simplia - Producto y Tecnologia |
| Audiencia | Equipo tecnico, producto, operaciones y direccion |

## Control Documental

| Version | Fecha | Cambio | Responsable |
| --- | --- | --- | --- |
| 1.0 | 2026-05-14 | Documento base generado para revision interna. | Simplia - Producto y Tecnologia |

## Resumen tecnico

> **Objetivo de implementacion**
>
> Convertir el dashboard actual de un cliente en una plataforma SaaS multiempresa: misma app, mismo codigo, datos aislados por company_id y RLS, configuracion por empresa, jobs multiempresa y sin secretos de cliente en frontend.

Este blueprint no ejecuta la migracion. Define como deberia hacerse para que el siguiente documento o sprint pueda convertirlo en tickets, migraciones SQL, cambios de frontend, Edge Functions y pruebas de seguridad.

## Estado actual real

### Estado actual observado en repo y Supabase

| Area | Estado actual | Implicacion para SaaS |
| --- | --- | --- |
| GitHub/Vercel | Un dashboard conectado desde main hacia Vercel. | Debe pasar a ser un producto global, no un deployment por cliente. |
| Schema cw | Concentra datos core del dashboard y backups desde Chatwoot. | Debe mantenerse como dominio comercial, pero con company_id en tablas de negocio. |
| public | Contiene n8n_followups_sent, N8N_error_Logs, n8n_chat_histories, citas_agendadas, scheduled_appointments, dashboard_tag_settings y users. | No debe alojar datos de negocio multiempresa sin RLS ni separacion por company_id. |
| dashboard_tag_settings | Existe fallback desde codigo y Edge Functions a public.dashboard_tag_settings. | Debe centralizarse en app.dashboard_settings o cw.dashboard_tag_settings con company_id; recomendado app.dashboard_settings. |
| Roles | Ya aparecen platform_admin, company_admin y operator en codigo. | Falta unirlos a empresa/membresia real. |
| Auth | auth.users identifica usuarios, y user_profiles se consulta para rol. | Debe migrarse a app.user_profiles + app.company_members para multiempresa. |
| Jobs | chatwoot-sync diario 12:01 a. m. Ecuador y send-scheduled-reports cada 5 minutos. | Ambos deben iterar o filtrar por company_id y registrar runs por empresa. |
| Secrets | El frontend referencia VITE_CHATWOOT_ACCOUNT_ID y VITE_CHATWOOT_API_TOKEN. | Los tokens de clientes no pueden vivir en VITE_*; deben usarse server-side. |

## Arquitectura objetivo

La aplicacion debe operar como SaaS pooled. El navegador nunca decide por si solo que datos puede ver. El usuario inicia sesion, el sistema determina sus empresas en app.company_members, selecciona active_company_id y cada consulta queda protegida por RLS y/o funciones server-side.

- Una sola version de codigo para todos los clientes.
- Una sola app Vercel global para clientes estandar.
- Un Supabase compartido inicial con schemas app, cw y automation.
- company_id obligatorio en toda tabla que contenga datos de cliente.
- Configuracion por empresa para prompts, plantillas, labels, campos visibles, reportes y webhooks.
- Modelo bridge/dedicado solo para enterprise.

## GitHub

### Modelo GitHub recomendado

| Rama/flujo | Uso | Regla |
| --- | --- | --- |
| main | Produccion | Siempre deployable. No se hacen cambios directos sin PR/revision. |
| staging | QA integrado | Opcional si el equipo necesita ambiente estable previo a main. |
| feature/* | Desarrollo de funcionalidades | Temporal. Se elimina despues de merge. |
| hotfix/* | Correcciones urgentes | Temporal y con merge rapido a main/staging. |
| client/* | No recomendado | No crear branches permanentes por cliente. |

## Vercel

### Modelo Vercel recomendado

| Decision | Como se maneja | Motivo |
| --- | --- | --- |
| Un dashboard global | dashboard.simplia.com o dashboard.simplia.com/<slug> o <slug>.dashboard.simplia.com. | Un solo producto, una sola version y menos operacion. |
| Identificacion de empresa | Por sesion y membresia; opcionalmente slug/subdominio para experiencia. | La URL no sustituye la seguridad. RLS filtra por company_id. |
| Variables de entorno | Solo variables globales no secretas en VITE_*. Tokens por cliente guardados server-side. | Todo VITE_* se expone al navegador. |
| Previews | Cada PR puede tener preview Vercel conectado a Supabase staging. | QA sin afectar clientes. |
| Vercel dedicado | Solo enterprise con entorno aislado y precio adicional. | Evita duplicar deployments para clientes estandar. |

## Supabase y schemas

### Schemas Supabase objetivo

| Schema | Responsabilidad | Ejemplos | Exposicion API |
| --- | --- | --- | --- |
| app | Core SaaS: empresas, usuarios, roles, configuracion, prompts, integraciones, auditoria. | companies, company_members, company_settings, dashboard_settings, prompt_templates. | Preferir no exponer completo; usar RPC/API controlada o RLS estricta. |
| cw | Datos derivados de Chatwoot y dashboard comercial. | contacts_current, conversations_current, messages, inboxes, reports, sync_runs. | Solo lo necesario para el dashboard, con RLS por company_id. |
| automation | n8n, webhooks, citas, colas, logs operativos, raw payloads. | chat_histories, followups_sent, scheduled_appointments, error_logs. | Privado por defecto; escritura mediante Edge Functions/webhooks server-side. |
| public | Idealmente sin datos de negocio. | Extensiones o views publicas estrictamente necesarias. | Minimizar superficie; cualquier tabla expuesta requiere RLS. |

La razon de mover datos fuera de public es de seguridad y claridad. En Supabase, public suele estar expuesto por la Data API. En multiempresa, cualquier tabla accesible sin RLS correcta es un riesgo de fuga. Los schemas app, cw y automation permiten separar producto, dominio Chatwoot y automatizaciones.

### Nuevas tablas SaaS requeridas

| Tabla | Proposito | Campos minimos recomendados |
| --- | --- | --- |
| app.companies | Tenant/empresa cliente. | id, slug, legal_name, display_name, status, plan, created_at, updated_at. |
| app.company_members | Membresia usuario-empresa y rol. | company_id, user_id, role, status, invited_by, created_at. |
| app.user_profiles | Perfil de usuario complementario a auth.users. | user_id, full_name, default_company_id, locale, created_at. |
| app.company_settings | Configuracion general por empresa. | company_id, key, value_json, updated_by, updated_at. |
| app.company_integrations | Credenciales y endpoints por empresa. | company_id, provider, encrypted_secret_ref, settings_json, status. |
| app.company_feature_flags | Activacion de modulos/features por empresa. | company_id, flag_key, enabled, config_json. |
| app.dashboard_settings | Settings visuales/comerciales del dashboard. | company_id, profile_key, settings_json, updated_by. |
| app.prompt_templates | Prompts por empresa o globales versionados. | company_id nullable, template_key, version, content, status. |
| app.message_templates | Plantillas de mensajes por empresa. | company_id, channel, template_key, content, variables_json. |
| app.company_audit_logs | Auditoria funcional y administrativa. | company_id, actor_user_id, action, entity, metadata, created_at. |
| app.usage_events | Medicion de consumo por empresa. | company_id, event_type, quantity, metadata, created_at. |

### Reubicacion de tablas public actuales

| Actual | Destino recomendado | Accion tecnica | Por que |
| --- | --- | --- | --- |
| public.n8n_chat_histories | automation.chat_histories | Crear tabla con company_id, source, raw_payload, session_id protegido, created_at. | Es historial operativo de automatizacion, no dato publico. |
| public.n8n_followups_sent | automation.followups_sent | Migrar filas y backfill company_id desde contexto de flujo. | Evita mezclar followups entre empresas. |
| public.N8N_error_Logs | automation.error_logs | Normalizar nombre a snake_case y registrar company_id cuando exista. | Logs por empresa permiten soporte y auditoria. |
| public.citas_agendadas | automation.scheduled_appointments | Unificar con scheduled_appointments o mapear a entidad de citas. | Evita doble fuente de verdad en citas. |
| public.scheduled_appointments | automation.scheduled_appointments | Definir columnas canonicas y migrar. | Debe ser operacional y multiempresa. |
| public.dashboard_tag_settings | app.dashboard_settings | Eliminar fallback inseguro/duplicado y guardar por company_id/profile_key. | Es configuracion del producto por empresa. |
| public.users | app.user_profiles o eliminar | Si duplica auth.users, migrar solo perfil y rol a company_members. | La identidad real debe ser auth.users. |

### cw multiempresa

| Grupo de tablas | Cambio requerido | Indices recomendados |
| --- | --- | --- |
| Conversaciones | Agregar company_id a conversations_current, conversation_attribute_history, conversation_label_history, conversation_label_events. | (company_id, updated_at), (company_id, conversation_id), (company_id, business_stage). |
| Contactos | Agregar company_id a contacts_current, contact_inboxes, contact_attribute_history. | (company_id, contact_id), (company_id, phone_number), (company_id, updated_at). |
| Mensajes | Agregar company_id a messages. | (company_id, conversation_id, created_at), (company_id, created_at). |
| Inboxes/equipos | Agregar company_id a inboxes, teams y configuracion relacionada. | (company_id, inbox_id), (company_id, name). |
| Reportes | Agregar company_id a automated_reports, automated_report_runs, reporting_events, daily_metrics. | (company_id, scheduled_at), (company_id, run_at), (company_id, metric_date). |
| Sync/import | Agregar company_id a sync_runs, raw_ingest, import_batches, import_batch_errors. | (company_id, started_at), (company_id, batch_id). |
| Auditoria | Agregar company_id a commercial_audit_events y eventos derivados. | (company_id, created_at), (company_id, entity_type, entity_id). |

## Reglas de datos operativos n8n

Las tablas operativas no tienen que vivir en cw si no son parte del dashboard comercial ni backups de Chatwoot. Deben vivir en automation porque pertenecen a flujos, webhooks, errores, colas e historiales tecnicos. Eso permite que cw se mantenga como modelo de negocio y analytics del dashboard.

- Toda tabla automation con datos de cliente debe tener company_id.
- Toda tabla de log/historial debe tener created_at, source, raw_payload y correlation_id cuando aplique.
- Los webhooks de n8n deben resolver company_id antes de insertar, usando integration_id, token firmado, path con slug validado server-side o mapping de Chatwoot account/inbox.
- Si no se puede resolver empresa, la solicitud se rechaza y se registra error sin mezclar datos.
- Los nombres deben normalizarse a ingles y snake_case: error_logs, chat_histories, followups_sent, scheduled_appointments.

### Regla para tablas operativas variables por cliente

| Caso | Solucion recomendada | Evitar |
| --- | --- | --- |
| Workflow reutilizable para varios clientes | Crear tabla canonica en automation con company_id, workflow_key, status, timestamps y payload tipado. | Crear una tabla por cliente o por nombre de empresa. |
| Workflow unico de un cliente, pero con datos que el dashboard no consulta | Guardar en automation.workflow_events o automation.raw_events con company_id, workflow_key, event_type, raw_payload jsonb. | Ensuciar public con tablas sueltas o duplicar schemas. |
| Workflow unico que luego sera feature del producto | Modelarlo desde el inicio como tabla canonica y feature flag por empresa. | Codificarlo como excepcion privada que no pueda versionarse. |
| Citas, followups, chat histories o errores | Usar tablas comunes: scheduled_appointments, followups_sent, chat_histories, error_logs. | Mantener nombres en espanol, mayusculas o duplicados public/cw. |
| Datos crudos para auditoria o debug | Guardar payload en jsonb con retencion definida y posibilidad de purga/archivo. | Guardar raw_payload infinito sin politica de retencion. |
| Necesidad de analitica historica | Promover campos consultados a columnas indexadas y dejar el resto en jsonb. | Consultar masivamente jsonb sin indices durante 5 anos de datos. |

> Esta regla responde al caso donde un cliente tenga 3 tablas n8n y otro 8: se modela por tipo de dato/workflow, no por empresa.

## Roles, login y membresia

### Reglas RLS base

| Caso | Regla | Notas |
| --- | --- | --- |
| platform_admin | Puede operar todas las empresas. | Debe identificarse por membership interna o claim controlado, no por email hardcodeado. |
| company_admin | Solo ve/administra su company_id. | Puede gestionar settings, usuarios del cliente, reportes e integraciones permitidas. |
| operator | Solo ve modulos autorizados de su company_id. | No accede a configuracion global ni datos de otras empresas. |
| service_role | Puede escribir procesos server-side. | Solo en Edge Functions/jobs; nunca en frontend. |
| Webhooks n8n | Si no resuelven company_id, se rechaza la escritura. | Resolver por secret, integration_id, account_id, inbox_id o webhook path firmado. |

auth.users debe ser la identidad. app.user_profiles guarda perfil complementario. app.company_members es la tabla que responde que empresas puede ver un usuario y con que rol. Un usuario puede pertenecer a una o varias empresas; por eso el rol no debe ser un unico campo global sin company_id.

- platform_admin: usuario interno Simplia con acceso multiempresa y operaciones de soporte.
- company_admin: gerencia del cliente; administra solo su empresa.
- operator: usuario operativo; ve modulos permitidos y datos de su empresa.
- La UI puede ocultar modulos, pero la seguridad real vive en RLS/Edge Functions.

### Flujo de entrega a cliente

| Paso | Responsable | Resultado |
| --- | --- | --- |
| Crear empresa | platform_admin | Registro en app.companies con slug, plan, estado activo y parametros base. |
| Configurar integraciones | platform_admin | Chatwoot/n8n/OpenAI/webhooks guardados en app.company_integrations con secrets server-side. |
| Configurar dashboard | platform_admin/company_admin | Settings, prompts, plantillas, labels, campos visibles y reportes por empresa. |
| Invitar usuarios | platform_admin/company_admin | auth.users + app.user_profiles + app.company_members. |
| Login | Usuario cliente | El sistema resuelve empresas disponibles y rol. |
| Seleccion de empresa | Sistema/usuario | active_company_id se guarda en sesion o se deriva de slug/subdominio. |
| Acceso a datos | Supabase RLS | Toda consulta queda filtrada por company_id y rol. |

## Configuracion por empresa

La personalizacion permitida debe convertirse en datos, no en codigo por cliente. Eso permite que una empresa tenga prompts, plantillas, labels, reportes o webhooks distintos sin romper el producto global.

- Prompts por empresa: app.prompt_templates con version y estado.
- Plantillas: app.message_templates por canal y variables.
- Labels y nombres visibles: app.dashboard_settings o app.company_settings.
- Campos visibles y orden de columnas: settings_json por perfil/dashboard.
- Webhooks y URLs de integracion: app.company_integrations, secrets server-side.
- Feature flags: app.company_feature_flags para activar modulos sin branch.
- Contexto empresarial para IA: company_settings/prompt_templates versionados.

## Backups, sync y jobs

### Jobs y backups multiempresa

| Job | Estado actual | Objetivo multiempresa |
| --- | --- | --- |
| chatwoot-sync diario 12:01 a. m. Ecuador | Cron a las 05:01 UTC llama chatwoot-sync. | Recorrer app.companies activas con integracion Chatwoot; cada run escribe company_id en cw.sync_runs y tablas destino. |
| send-scheduled-reports cada 5 minutos | Cron llama Edge Function que consulta reportes. | Buscar reportes por company_id, respetar timezone/estado, crear automated_report_runs con company_id. |
| n8n webhooks | Insertan en tablas public operativas. | Insertar en automation.* resolviendo empresa por webhook/integration secret; rechazar sin company_id. |
| Backups de datos | Supabase daily backups segun plan y backups logicos si se configuran. | Plan de 5 anos: daily backup operativo, exports periodicos por tenant, prueba de restore y archivo historico. |
| Errores | Logs dispersos o N8N_error_Logs. | automation.error_logs con company_id, provider, severity, raw_payload y correlation_id. |

## Seguridad tecnica

- Eliminar tokens de cliente de VITE_*; cualquier variable VITE_* es visible en el navegador.
- Usar Edge Functions o backend server-side para Chatwoot, OpenAI y webhooks que requieran secretos.
- Activar RLS en todas las tablas expuestas y quitar policies using(true) antes de multiempresa.
- Preferir schemas internos no expuestos para automation y app sensible.
- Crear helpers de RLS auditados para validar membresia activa.
- Registrar auditoria con company_id, actor_user_id, action, metadata y created_at.

### Ejemplo conceptual de tablas base

```sql
-- Ejemplo conceptual, no ejecutar sin adaptarlo a migraciones reales.
create schema if not exists app;
create schema if not exists automation;

create table if not exists app.companies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists app.company_members (
  company_id uuid not null references app.companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('platform_admin', 'company_admin', 'operator')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

alter table app.company_members enable row level security;
-- Policies finales deben revisarse con SECURITY DEFINER helpers auditados.
```

## Migracion propuesta

### Plan de migracion por fases

| Fase | Objetivo | Tareas | Criterio de salida |
| --- | --- | --- | --- |
| 0. Medicion | Conocer volumen real. | Medir filas y tamanos por tabla; listar RLS/policies; inventariar webhooks y secrets. | Inventario aprobado y backup previo. |
| 1. Base SaaS | Crear app.companies, company_members, user_profiles y settings. | Crear tenant inicial para cliente actual, roles y seeds. | Usuarios actuales pueden loguear con empresa inicial. |
| 2. company_id | Preparar datos existentes. | Agregar company_id nullable, backfill, indices compuestos, constraints. | Todas las tablas de negocio tienen company_id poblado. |
| 3. Reubicar public | Mover operativas a app/automation. | Crear nuevas tablas, copiar datos, views temporales si se necesita compatibilidad. | No hay escrituras nuevas a public para datos de negocio. |
| 4. Actualizar codigo | Frontend y Edge Functions multiempresa. | Resolver active_company_id, filtrar queries, quitar fallback a public.dashboard_tag_settings. | Dashboard funciona para empresa inicial. |
| 5. RLS real | Aislamiento por tenant. | Activar policies restrictivas, quitar using(true), pruebas A/B. | Empresa A no puede leer/escribir B. |
| 6. Jobs multiempresa | Backups, sync y reportes por empresa. | Iterar companies activas, registrar runs por company_id, logs por empresa. | Jobs pasan pruebas con dos empresas simuladas. |
| 7. Hardening | Seguridad y operacion. | Mover secrets, monitoreo, alertas, limites de uso, restore drill. | Checklist de salida a produccion aprobado. |

## Riesgos tecnicos y controles

### Controles tecnicos

| Riesgo | Control |
| --- | --- |
| Fuga de datos por RLS mal hecha | Pruebas automaticas cross-tenant, revision de policies, uso minimo de service_role. |
| Mezcla de datos n8n | Resolver company_id en webhook y rechazar payloads sin tenant. |
| Noisy neighbor | usage_events por tenant, indices, limites, alertas y opcion bridge. |
| Storage alto por 5 anos | Particionado, archivo, limpieza de raw_payload innecesario y medicion mensual. |
| n8n cuello de botella | Idempotencia, colas, retries, limites y migrar flujos criticos a codigo si crecen. |
| Secrets expuestos | Mover secrets a Supabase secrets/Vault/variables server-side, nunca frontend. |
| Forks encubiertos | Feature flags, modulos configurables y politica contractual. |

## Testing y criterios de aceptacion

### Pruebas obligatorias

| Prueba | Resultado esperado |
| --- | --- |
| Empresa A consulta conversaciones | Solo recibe company_id A. |
| Empresa A intenta consultar B por id conocido | RLS devuelve 0 filas o error controlado. |
| company_admin de A accede a settings de B | Acceso denegado. |
| operator accede a configuracion global | Acceso denegado. |
| Webhook n8n sin empresa | HTTP 400/401; no inserta datos. |
| Webhook n8n con secret de A | Inserta solo company_id A. |
| Sync nocturno | Crea sync_run por empresa e inserta company_id en destino. |
| Reporte programado | Genera runs por empresa sin mezclar settings/prompts. |
| dashboard_settings por empresa | Cambiar labels de A no afecta B. |
| Consulta historica 5 anos | Usa indices/particiones y no escanea toda la base. |

## Roadmap de implementacion sugerido

1. Semana 1: inventario final, medicion de tablas, diseno SQL y contrato de company_id.
2. Semana 2: crear schema app, tenant inicial, membresias y settings base.
3. Semana 3: agregar company_id e indices en cw; backfill del cliente actual.
4. Semana 4: mover tablas public a automation/app y crear compatibilidad temporal si se requiere.
5. Semana 5: actualizar frontend, repositorios de datos y Edge Functions para active_company_id.
6. Semana 6: RLS restrictivo, pruebas de aislamiento, jobs multiempresa y hardening de secrets.
7. Semana 7: onboarding de segundo cliente real en el mismo SaaS y monitoreo.

El cronograma depende del tamano real de las tablas y de cuanto codigo hoy consulta directamente public/cw sin capa de repositorio. No se recomienda activar multiempresa sin completar las pruebas de aislamiento.

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
