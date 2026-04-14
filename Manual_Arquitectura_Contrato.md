# Manual de Arquitectura y Contrato Técnico - SimpliaLeads 🏛️

**Versión:** 2.0 (Preparada para IA / Agentes MCP)
**Contexto del Proyecto:** Dashboard Híbrido Chatwoot-Supabase para Inteligencia Comercial.

## 1. Visión General
SimpliaLeads es una plataforma de **Inteligencia Comercial** que transforma conversaciones crudas de Chatwoot en activos estratégicos de datos.
Su arquitectura resuelve la volatilidad de datos en Chatwoot (retención limitada) ingestando de forma incremental todo el historial en un Data Warehouse (Supabase) bajo un esquema altamente estructurado para habilitar reportes rígidos y longitudinales sin latencia.

## 2. Capas de la Aplicación

### Capa 1: Frontend & Persistencia Local (Browser Context)
- **Tecnología:** React + Vite + TailwindCSS + IndexedDB vía `StorageService`.
- **Propósito:** Ofrecer una experiencia de usuario instantánea y mitigar los límites de rate-limit de la API en el uso operacional diario.

### Capa 2: Data Warehouse (Supabase)
- **Propósito:** Almacén persistente de largo plazo de todo el Contact Center.
- **Esquema Aislado:** Toda la operatoria debe ocurrir bajo el esquema privado `cw` y NO sobre el esquema `public`.

### Capa 3: Motor de Sincronización (Edge Computing)
- **Supabase Edge Functions:** Implementadas bajo el runtime de Deno (`chatwoot-sync`).
- **Eficiencia:** Extracción selectiva y aplanado de atributos (Custom Attributes) como "Canal", "Agencia" y "Monto Operación".

---

## 3. Diccionario de Datos (Schema Contract)
Para que el entorno funcione de manera idéntica a Producción, **el Esquema `cw` debe poseer estrictamente las siguientes tablas core:**

### Tabla Central: `cw.conversations_current`
La tabla raíz para el renderizado del dashboard de métricas.

| Campo | Tipo | Notas / Uso en Dashboards |
| :--- | :--- | :--- |
| `chatwoot_conversation_id` | `bigint` (PK) | Llave primaria remota. |
| `chatwoot_contact_id` | `bigint` (FK) | Identificador de identidad. |
| `status` | `text` | `open`, `snoozed`, `resolved`. Calcula el Backlog. |
| `labels` | `text[]` (Array) | Fundamental para cálculo de métricas (citas, descartes). |
| `created_at_chatwoot` | `timestamptz` | Fecha original de ingreso de la oportunidad. |
| `first_reply_created_at` | `timestamptz` | Marca de tiempo de la respuesta del agente. Calcula SLA. |
| `waiting_since` | `timestamptz` | Calcula tiempo en cola total actual. |
| `canal` | `text` | Aplanado (Tiktok, Telegram, Whatsapp, etc.). |
| `monto_operacion` | `text` | Extraído de los `custom_attributes`. |
| `agencia` | `text` | Atributo extra. |

### Tablas Satélites Vitales
1. **`cw.contacts_current`**: (PK `chatwoot_contact_id`). Requerido para relacionar FK de la conversación. (Columnas: `name`, `phone_number`, `email`, `custom_attributes`).
2. **`cw.inboxes`**: (PK `chatwoot_inbox_id`). Define las fuentes origen y canales (`channel_type`, `name`).
3. **`cw.messages`**: (PK `chatwoot_message_id`). Auditoría profunda tipo y calidad de contenido (`message_direction`, `content`, `sentiment`).
4. **`cw.sync_runs`**: Tracking de ejecuciones del Edge Function (`sync_type`, `started_at`, `finished_at`, `status`, `stats`).
5. **`cw.sync_cursor`**: (PK `cursor_name`). Administra la paginación para la ingesta del sistema (Evita ingestión duplicada). Guarda fechas `last_since_ts`, `last_until_ts`.

---

## 4. Definición de KPIs Críticos (Data Engine Mapping)
Todo Agente que implemente consultas sobre Supabase, debe apegarse a estas lógicas:

- **Volumen de Leads:** Conteo distinto de `chatwoot_conversation_id` de la tabla `cw.conversations_current` donde `created_at_chatwoot` está en el rango.
- **Tasa de Contacto:** `(Leads contactados / Leads totales) * 100`. Contactado significa `first_reply_created_at` NO ES NULO.
- **Tasa de Agendamiento/Venta:** Conversaciones donde el array `labels` contiene etiquetas (ignorando mayúsculas) de tipo `cita`, `venta`, `booking`, `cita_agendada`.
- **Cierre Perdido:** Conversaciones donde `labels` contiene `perdido`, `descartado`, `spam`.
- **Backlog:** Toda conversación con `status != 'resolved'`. 
- **Cumplimiento SLA (%):** Margen de conversaciones donde la diferencia entre `first_reply_created_at` y `created_at_chatwoot` es <= 30 minutos, dividido para el total de conversaciones operadas. 
- **Mediana de Respuesta:** Mediana matemática de la diferencia en minutos (no el promedio).

---

## 5. Protocolo de Aprovisionamiento Estricto para IA / Agencias (MCP)

Si un Agente LLM (Claude, Cursor, Aider, Gemini vía MCP) recibe el comando de "Montar de Cero", debe ejecutar de forma transaccional el siguiente flujo en Supabase:

1. **Inicialización:** `CREATE SCHEMA IF NOT EXISTS cw;`
2. **Creación de Roles/Privilegios:** Deshabilitar RLS temporalmente o crear políticas estrictas de lectura y escritura para el Edge Function y Dashboard.
3. **Poblado Estructural:** Ejecutar `CREATE TABLE` en el orden de independencias (1. Configs, 2. Inboxes, 3. Contacts, 4. Conversations, 5. Messages).
4. **Despliegue Serverless:** Crear, empaquetar y publicar el código fuente en `supabase/functions/chatwoot-sync`.
5. **Configuración de Vault/Config:** Enviar las variables de entorno (Base URL, Tokens) descritas en el Manual Operativo.
6. **Configuración CRON:** Alterar la base de datos para registrar `pg_cron` llamando al endpoint publicado de la función de sync a medianoche mediante `pg_net` POST.

Esto garantiza replicabilidad automática de 1 click para nuevos clientes/instancias de Chatwoot.
