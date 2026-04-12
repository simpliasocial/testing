Analiza este proyecto completo. Necesito que implementes una capa de sincronización histórica desde Chatwoot hacia Supabase.

Objetivo:
- crear tablas SQL para guardar contactos, conversaciones, mensajes, reporting events, labels, stages yapl custom attributes dinámicos
- no usar columnas fijas para custom attributes; usar JSONB
- preparar lógica para histórico diario y lectura para dashboard
- mantener compatibilidad con múltiples empresas, donde cada empresa tiene su propia base de datos
- proponer los archivos exactos a crear o modificar
- mostrar primero el plan
- luego generar el código archivo por archivo

Antes de cambiar nada, revisa la estructura actual del proyecto y dime:
1. qué archivos tocarás
2. qué nuevos archivos crearás
3. qué dependencias faltan
4. qué riesgos ves

basicamnete en suspabse me vas a hacer cmo qeu tipo el dashborad solito coja los datos al final del dia de api de chatwoot y deacrgue todos los datos necesarios que se utlicen para que en caso de que se caiga chatwoot api pues ahor los datos seran de esta de suapabse. Pero calro el dashbord directamnete es de la api de chatwoot para mantenerlo live. Solo si se cae se usa el de supabase (pero est luego veo la logica)

es guardar todos los datos de chatwoot api pero todo de todo cosa que sea dinamico y asi poruqe tiene que guardar todo de todo

Ahora sí: si cada empresa va a tener su propia base de datos de Supabase, entonces no necesitas una tabla multiempresa tipo workspaces. Lo correcto es que cada base tenga su propio esquema de histórico de Chatwoot y su propia automatización diaria. Además, como el endpoint de contacts de Chatwoot lista solo los resolved contacts —los que ya tienen identifier, email o phone_number—, no puedes basarte solo en contactos para tu histórico; para no perder casos manuales o incompletos, tu fuente principal debe ser conversations + messages + reporting_events, y contactos debe servir como enriquecimiento.

También te faltaba una pieza clave para la lógica diaria: el endpoint de Conversations List tiene filtros como assignee_type, status, q, inbox_id, team_id, labels y page, pero no expone un filtro “updated_since”. En cambio, Account Reporting Events sí acepta since y until, además de filtros por inbox_id, user_id y name, y devuelve conversation_id, inbox_id, user_id, name, value, event_start_time, event_end_time, created_at y updated_at. Por eso, para tu job diario, la forma más sólida es: usar reporting_events para detectar qué conversaciones tuvieron movimiento en el rango del día, y luego refrescar esas conversaciones con conversation details y messages.

A nivel de datos, Chatwoot sí te puede dar prácticamente todo lo que necesitas para tu dashboard e histórico. En contacts te devuelve campos como id, name, phone_number, email, identifier, blocked, thumbnail, availability_status, additional_attributes, custom_attributes, last_activity_at, created_at y también contact_inboxes con source_id e información del inbox. En conversations te devuelve account_id, uuid, additional_attributes, agent_last_seen_at, assignee_last_seen_at, can_reply, contact_last_seen_at, custom_attributes, inbox_id, labels, muted, snoozed_until, status, created_at, updated_at, timestamp, first_reply_created_at, unread_count, last_non_activity_message, last_activity_at, priority, waiting_since, sla_policy_id, applied_sla, sla_events y meta. En messages puedes listar todos los mensajes de una conversación. En custom_attribute_definitions puedes leer el catálogo dinámico de atributos del account, con id, attribute_display_name, attribute_display_type, attribute_description, attribute_key, regex_pattern, regex_cue, attribute_values, attribute_model, default_value, created_at y updated_at. Y en reports tienes tanto series temporales por métrica como resúmenes con conversations_count, incoming_messages_count, outgoing_messages_count, avg_first_response_time, avg_resolution_time y resolutions_count.

Además, si luego quieres mejorar de diario a casi en vivo, Chatwoot también soporta webhooks para conversation_created, conversation_status_changed, conversation_updated, message_created, message_updated, contact_created, contact_updated y webwidget_triggered.

Qué te recomiendo crear en cada base de datos de cada empresa

La estructura correcta, para que sea dinámica y no dependa de columnas fijas como correo, ciudad o edad, es esta:

Una tabla de configuración de la cuenta de Chatwoot de esa empresa.
Un catálogo de inboxes.
Un catálogo de teams.
Un catálogo dinámico de custom attributes.
Una tabla RAW para guardar el payload completo que llegó desde API o webhook.
Una tabla contacts_current con el estado actual del contacto.
Una tabla contact_inboxes porque un contacto puede estar ligado a varios inboxes.
Una tabla contact_attribute_history para guardar los cambios de cualquier atributo dinámico del contacto.
Una tabla conversations_current con el estado actual de cada conversación.
Una tabla conversation_attribute_history para el histórico de atributos de conversación.
Una tabla conversation_label_history para saber cuándo entró o salió cada etiqueta.
Una tabla business_stage_history para tu etapa de negocio, porque eso es lógica tuya y no conviene depender de que exista como campo nativo.
Una tabla messages con una fila por mensaje.
Una tabla reporting_events para SLA, tiempos de respuesta y resolución.
Una tabla daily_metrics para congelar cada día los KPIs que luego mostrarás en dashboard.
Una tabla sync_runs y otra sync_cursor para saber hasta dónde sincronizaste.

La idea central es esta: los atributos dinámicos van en JSONB, el catálogo de qué atributos existen va en attribute_definitions, y el histórico fino va en tablas de cambios. Así el mismo esquema te sirve para cualquier empresa aunque hoy tenga correo y mañana otra tenga placa, modelo o sucursal_preferida. Esto encaja con el hecho de que Chatwoot expone el catálogo dinámico de custom attributes por account y también devuelve custom_attributes y additional_attributes como objetos.

SQL recomendado para una empresa / una base de datos
create extension if not exists pgcrypto;

create schema if not exists cw;

create or replace function cw.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1) CONFIG DE ESTA EMPRESA / ESTA CUENTA
-- =========================================================
create table if not exists cw.account_config (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  chatwoot_base_url text not null,
  chatwoot_account_id bigint not null unique,
  timezone text not null default 'America/Guayaquil',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_account_config_updated_at
before update on cw.account_config
for each row execute function cw.set_updated_at();

-- =========================================================
-- 2) CURSORES Y CORRIDAS DE SINCRONIZACIÓN
-- =========================================================
create table if not exists cw.sync_cursor (
  cursor_name text primary key, -- daily_delta, weekly_repair, bootstrap, etc.
  last_since_ts timestamptz,
  last_until_ts timestamptz,
  cursor_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger trg_sync_cursor_updated_at
before update on cw.sync_cursor
for each row execute function cw.set_updated_at();

create table if not exists cw.sync_runs (
  id bigserial primary key,
  sync_type text not null, -- bootstrap, daily_delta, repair, webhook
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','success','partial','error')),
  stats jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 3) RAW: GUARDA TODO LO QUE VINO DE CHATWOOT
-- =========================================================
create table if not exists cw.raw_ingest (
  id bigserial primary key,
  source_type text not null check (source_type in ('api','webhook','manual','repair')),
  endpoint_name text not null,
  event_name text,
  entity_type text, -- contact, conversation, message, report, custom_attribute, inbox, team
  chatwoot_entity_id bigint,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  processed boolean not null default false,
  processing_error text
);

create index if not exists idx_raw_ingest_lookup
on cw.raw_ingest (entity_type, chatwoot_entity_id, fetched_at desc);

create index if not exists idx_raw_ingest_payload_gin
on cw.raw_ingest using gin (payload);

-- =========================================================
-- 4) CATÁLOGOS: INBOXES, TEAMS, ATTRIBUTE DEFINITIONS
-- =========================================================
create table if not exists cw.inboxes (
  chatwoot_inbox_id bigint primary key,
  name text,
  website_url text,
  channel_type text,
  avatar_url text,
  widget_color text,
  website_token text,
  enable_auto_assignment boolean,
  web_widget_script text,
  welcome_title text,
  welcome_tagline text,
  greeting_enabled boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_inboxes_updated_at
before update on cw.inboxes
for each row execute function cw.set_updated_at();

create table if not exists cw.teams (
  chatwoot_team_id bigint primary key,
  name text,
  description text,
  allow_auto_assign boolean,
  is_member boolean,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_teams_updated_at
before update on cw.teams
for each row execute function cw.set_updated_at();

create table if not exists cw.attribute_definitions (
  id bigserial primary key,
  chatwoot_attribute_id bigint not null,
  attribute_scope text not null check (attribute_scope in ('contact','conversation','unknown')),
  attribute_key text not null,
  attribute_display_name text,
  attribute_display_type text,
  attribute_description text,
  regex_pattern text,
  regex_cue text,
  attribute_values jsonb,
  attribute_model text,
  default_value jsonb,
  created_at_chatwoot timestamptz,
  updated_at_chatwoot timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatwoot_attribute_id),
  unique (attribute_scope, attribute_key)
);

create trigger trg_attribute_definitions_updated_at
before update on cw.attribute_definitions
for each row execute function cw.set_updated_at();

-- =========================================================
-- 5) CONTACTOS
-- =========================================================
create table if not exists cw.contacts_current (
  chatwoot_contact_id bigint primary key,
  lead_identity_key text, -- teléfono normalizado / email / identifier / fallback propio
  identifier text,
  name text,
  phone_number text,
  email text,
  blocked boolean,
  thumbnail text,
  availability_status text,
  additional_attributes jsonb not null default '{}'::jsonb,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_at_chatwoot timestamptz,
  last_activity_at_chatwoot timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_contacts_current_updated_at
before update on cw.contacts_current
for each row execute function cw.set_updated_at();

create index if not exists idx_contacts_current_lead_identity
on cw.contacts_current (lead_identity_key);

create index if not exists idx_contacts_current_last_seen
on cw.contacts_current (last_seen_at desc);

create index if not exists idx_contacts_current_custom_attrs_gin
on cw.contacts_current using gin (custom_attributes);

create index if not exists idx_contacts_current_additional_attrs_gin
on cw.contacts_current using gin (additional_attributes);

create table if not exists cw.contact_inboxes (
  id bigserial primary key,
  chatwoot_contact_id bigint not null references cw.contacts_current(chatwoot_contact_id) on delete cascade,
  chatwoot_inbox_id bigint,
  source_id text,
  inbox_name text,
  channel_type text,
  provider text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chatwoot_contact_id, chatwoot_inbox_id, source_id)
);

create trigger trg_contact_inboxes_updated_at
before update on cw.contact_inboxes
for each row execute function cw.set_updated_at();

create table if not exists cw.contact_attribute_history (
  id bigserial primary key,
  chatwoot_contact_id bigint not null references cw.contacts_current(chatwoot_contact_id) on delete cascade,
  attribute_key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now(),
  change_source text not null default 'sync'
    check (change_source in ('sync','webhook','repair','manual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_attribute_history_lookup
on cw.contact_attribute_history (chatwoot_contact_id, attribute_key, changed_at desc);

-- =========================================================
-- 6) CONVERSACIONES
-- =========================================================
create table if not exists cw.conversations_current (
  chatwoot_conversation_id bigint primary key,
  chatwoot_contact_id bigint references cw.contacts_current(chatwoot_contact_id) on delete set null,
  chatwoot_account_id bigint,
  chatwoot_inbox_id bigint,
  chatwoot_team_id bigint,
  assignee_id bigint,
  uuid text,
  status text,
  priority text,
  can_reply boolean,
  muted boolean,
  snoozed_until timestamptz,
  unread_count integer,
  labels text[] not null default '{}'::text[],
  business_stage_current text, -- tu etapa de negocio
  additional_attributes jsonb not null default '{}'::jsonb,
  custom_attributes jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  applied_sla jsonb not null default '{}'::jsonb,
  sla_events jsonb not null default '[]'::jsonb,
  inbox_name text,
  channel_type text,
  provider text,
  conversation_url text,
  timestamp_text text,
  first_reply_created_at_chatwoot timestamptz,
  agent_last_seen_at_chatwoot timestamptz,
  assignee_last_seen_at_chatwoot timestamptz,
  contact_last_seen_at_chatwoot timestamptz,
  waiting_since_chatwoot timestamptz,
  last_activity_at_chatwoot timestamptz,
  created_at_chatwoot timestamptz,
  updated_at_chatwoot timestamptz,
  last_non_activity_message_id bigint,
  last_non_activity_message_preview text,
  first_message_at timestamptz,
  last_message_at timestamptz,
  last_incoming_message_at timestamptz,
  last_outgoing_message_at timestamptz,
  total_messages integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_conversations_current_updated_at
before update on cw.conversations_current
for each row execute function cw.set_updated_at();

create index if not exists idx_conversations_current_contact
on cw.conversations_current (chatwoot_contact_id);

create index if not exists idx_conversations_current_status
on cw.conversations_current (status);

create index if not exists idx_conversations_current_last_activity
on cw.conversations_current (last_activity_at_chatwoot desc);

create index if not exists idx_conversations_current_stage
on cw.conversations_current (business_stage_current);

create index if not exists idx_conversations_current_labels_gin
on cw.conversations_current using gin (labels);

create index if not exists idx_conversations_current_custom_attrs_gin
on cw.conversations_current using gin (custom_attributes);

create table if not exists cw.conversation_attribute_history (
  id bigserial primary key,
  chatwoot_conversation_id bigint not null references cw.conversations_current(chatwoot_conversation_id) on delete cascade,
  attribute_key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now(),
  change_source text not null default 'sync'
    check (change_source in ('sync','webhook','repair','manual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_attribute_history_lookup
on cw.conversation_attribute_history (chatwoot_conversation_id, attribute_key, changed_at desc);

create table if not exists cw.conversation_label_history (
  id bigserial primary key,
  chatwoot_conversation_id bigint not null references cw.conversations_current(chatwoot_conversation_id) on delete cascade,
  label text not null,
  action text not null check (action in ('added','removed')),
  changed_at timestamptz not null default now(),
  change_source text not null default 'sync'
    check (change_source in ('sync','webhook','repair','manual')),
  created_at timestamptz not null default now()
);

create index if not exists idx_conversation_label_history_lookup
on cw.conversation_label_history (chatwoot_conversation_id, label, changed_at desc);

create table if not exists cw.business_stage_history (
  id bigserial primary key,
  chatwoot_conversation_id bigint not null references cw.conversations_current(chatwoot_conversation_id) on delete cascade,
  old_stage text,
  new_stage text,
  changed_at timestamptz not null default now(),
  change_reason text,
  change_source text not null default 'sync'
    check (change_source in ('sync','webhook','repair','manual','bot')),
  created_at timestamptz not null default now()
);

create index if not exists idx_business_stage_history_lookup
on cw.business_stage_history (chatwoot_conversation_id, changed_at desc);

-- =========================================================
-- 7) MENSAJES
-- =========================================================
create table if not exists cw.messages (
  chatwoot_message_id bigint primary key,
  chatwoot_conversation_id bigint not null references cw.conversations_current(chatwoot_conversation_id) on delete cascade,
  chatwoot_contact_id bigint,
  chatwoot_account_id bigint,
  chatwoot_inbox_id bigint,
  sender_id bigint,
  sender_type text,
  message_type text,
  message_direction text not null default 'unknown'
    check (message_direction in ('incoming','outgoing','activity','note','unknown')),
  content text,
  content_type text,
  content_attributes jsonb not null default '{}'::jsonb,
  additional_attributes jsonb not null default '{}'::jsonb,
  external_source_ids jsonb not null default '{}'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  sender jsonb not null default '{}'::jsonb,
  sentiment jsonb not null default '{}'::jsonb,
  processed_message_content text,
  source_id text,
  status text,
  is_private boolean not null default false,
  created_at_chatwoot timestamptz,
  updated_at_chatwoot timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation_date
on cw.messages (chatwoot_conversation_id, created_at_chatwoot desc);

create index if not exists idx_messages_contact_date
on cw.messages (chatwoot_contact_id, created_at_chatwoot desc);

create index if not exists idx_messages_content_attrs_gin
on cw.messages using gin (content_attributes);

-- =========================================================
-- 8) REPORTING EVENTS
-- =========================================================
create table if not exists cw.reporting_events (
  chatwoot_reporting_event_id bigint primary key,
  name text,
  value numeric,
  value_in_business_hours numeric,
  event_start_time timestamptz,
  event_end_time timestamptz,
  chatwoot_account_id bigint,
  chatwoot_conversation_id bigint,
  chatwoot_inbox_id bigint,
  chatwoot_user_id bigint,
  created_at_chatwoot timestamptz,
  updated_at_chatwoot timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reporting_events_lookup
on cw.reporting_events (chatwoot_conversation_id, name, created_at_chatwoot desc);

create index if not exists idx_reporting_events_date
on cw.reporting_events (event_start_time, event_end_time);

-- =========================================================
-- 9) MÉTRICAS DIARIAS CONGELADAS
-- =========================================================
create table if not exists cw.daily_metrics (
  id bigserial primary key,
  metric_date date not null,
  metric_scope text not null
    check (metric_scope in ('summary','activities','unique','stage','label','channel','inbox','team','sla','custom')),
  metric_name text not null,
  metric_value numeric not null,
  dimensions jsonb not null default '{}'::jsonb,
  calculated_at timestamptz not null default now(),
  dim_hash text generated always as (md5(dimensions::text)) stored
);

create unique index if not exists uq_daily_metrics
on cw.daily_metrics (metric_date, metric_scope, metric_name, dim_hash);

create index if not exists idx_daily_metrics_lookup
on cw.daily_metrics (metric_date desc, metric_scope, metric_name);

-- =========================================================
-- 10) TRIGGERS DE HISTÓRICO DINÁMICO
-- =========================================================
create or replace function cw.capture_contact_attribute_history()
returns trigger
language plpgsql
as $$
declare
  k text;
  old_j jsonb;
  new_j jsonb;
begin
  new_j := coalesce(new.custom_attributes, '{}'::jsonb);

  if tg_op = 'INSERT' then
    for k in select jsonb_object_keys(new_j)
    loop
      insert into cw.contact_attribute_history (
        chatwoot_contact_id, attribute_key, old_value, new_value, changed_at, change_source
      )
      values (
        new.chatwoot_contact_id,
        k,
        null,
        new_j -> k,
        coalesce(new.last_activity_at_chatwoot, new.created_at_chatwoot, now()),
        'sync'
      );
    end loop;

    return new;
  end if;

  old_j := coalesce(old.custom_attributes, '{}'::jsonb);

  if old_j is distinct from new_j then
    for k in
      select key
      from (
        select jsonb_object_keys(old_j) as key
        union
        select jsonb_object_keys(new_j) as key
      ) s
    loop
      if (old_j -> k) is distinct from (new_j -> k) then
        insert into cw.contact_attribute_history (
          chatwoot_contact_id, attribute_key, old_value, new_value, changed_at, change_source
        )
        values (
          new.chatwoot_contact_id,
          k,
          old_j -> k,
          new_j -> k,
          now(),
          'sync'
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger trg_capture_contact_attribute_history
after insert or update of custom_attributes
on cw.contacts_current
for each row
execute function cw.capture_contact_attribute_history();

create or replace function cw.capture_conversation_history()
returns trigger
language plpgsql
as $$
declare
  k text;
  lbl text;
  old_j jsonb;
  new_j jsonb;
  old_labels text[];
  new_labels text[];
begin
  new_j := coalesce(new.custom_attributes, '{}'::jsonb);
  new_labels := coalesce(new.labels, '{}'::text[]);

  if tg_op = 'INSERT' then
    if new.business_stage_current is not null then
      insert into cw.business_stage_history (
        chatwoot_conversation_id, old_stage, new_stage, changed_at, change_reason, change_source
      )
      values (
        new.chatwoot_conversation_id,
        null,
        new.business_stage_current,
        coalesce(new.updated_at_chatwoot, new.created_at_chatwoot, now()),
        'initial sync',
        'sync'
      );
    end if;

    foreach lbl in array new_labels
    loop
      insert into cw.conversation_label_history (
        chatwoot_conversation_id, label, action, changed_at, change_source
      )
      values (
        new.chatwoot_conversation_id,
        lbl,
        'added',
        coalesce(new.updated_at_chatwoot, new.created_at_chatwoot, now()),
        'sync'
      );
    end loop;

    for k in select jsonb_object_keys(new_j)
    loop
      insert into cw.conversation_attribute_history (
        chatwoot_conversation_id, attribute_key, old_value, new_value, changed_at, change_source
      )
      values (
        new.chatwoot_conversation_id,
        k,
        null,
        new_j -> k,
        coalesce(new.updated_at_chatwoot, new.created_at_chatwoot, now()),
        'sync'
      );
    end loop;

    return new;
  end if;

  if old.business_stage_current is distinct from new.business_stage_current then
    insert into cw.business_stage_history (
      chatwoot_conversation_id, old_stage, new_stage, changed_at, change_reason, change_source
    )
    values (
      new.chatwoot_conversation_id,
      old.business_stage_current,
      new.business_stage_current,
      now(),
      'stage changed on sync',
      'sync'
    );
  end if;

  old_labels := coalesce(old.labels, '{}'::text[]);

  for lbl in (
    select unnest(new_labels)
    except
    select unnest(old_labels)
  )
  loop
    insert into cw.conversation_label_history (
      chatwoot_conversation_id, label, action, changed_at, change_source
    )
    values (
      new.chatwoot_conversation_id,
      lbl,
      'added',
      now(),
      'sync'
    );
  end loop;

  for lbl in (
    select unnest(old_labels)
    except
    select unnest(new_labels)
  )
  loop
    insert into cw.conversation_label_history (
      chatwoot_conversation_id, label, action, changed_at, change_source
    )
    values (
      new.chatwoot_conversation_id,
      lbl,
      'removed',
      now(),
      'sync'
    );
  end loop;

  old_j := coalesce(old.custom_attributes, '{}'::jsonb);

  if old_j is distinct from new_j then
    for k in
      select key
      from (
        select jsonb_object_keys(old_j) as key
        union
        select jsonb_object_keys(new_j) as key
      ) s
    loop
      if (old_j -> k) is distinct from (new_j -> k) then
        insert into cw.conversation_attribute_history (
          chatwoot_conversation_id, attribute_key, old_value, new_value, changed_at, change_source
        )
        values (
          new.chatwoot_conversation_id,
          k,
          old_j -> k,
          new_j -> k,
          now(),
          'sync'
        );
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger trg_capture_conversation_history
after insert or update of custom_attributes, labels, business_stage_current
on cw.conversations_current
for each row
execute function cw.capture_conversation_history();
Qué guarda cada tabla y por qué sí te cubre “todo”

La tabla cw.attribute_definitions existe para que tu sistema detecte solo qué atributos están definidos en esa empresa, sin asumir un set fijo de columnas. Eso sale directamente del endpoint custom_attribute_definitions, que devuelve attribute_key, attribute_display_name, attribute_display_type, attribute_model, default_value, regex_pattern, regex_cue, etc.

Las tablas cw.contacts_current y cw.conversations_current guardan el estado actual. Allí es donde leerías para cosas como: total de leads actuales, etapa actual, última actividad, etiquetas actuales, inbox, canal, última respuesta, URL de conversación y atributos actuales. Los campos nativos que puedes poblar vienen de los endpoints de contactos y conversaciones.

Las tablas cw.contact_attribute_history, cw.conversation_attribute_history, cw.conversation_label_history y cw.business_stage_history guardan el pasado. Eso es lo que evita que pierdas información cuando hoy el lead está en interesado y mañana pasa a cita_agendada, o cuando un atributo como fecha_visita cambia. Como Chatwoot te devuelve labels, custom_attributes y additional_attributes como estructuras, la forma correcta de historizarlas es con JSONB + tablas de cambio, no con columnas quemadas.

La tabla cw.messages es la que te cubre el histórico real de conversación. El endpoint GET /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages lista todos los mensajes de una conversación, y en los ejemplos/documentación se ven campos como id, content, message_type, content_type, content_attributes, created_at, conversation_id, attachments y sender; además, en la respuesta embebida de conversaciones aparecen sender_type, sender_id, status, source_id, external_source_ids, additional_attributes, processed_message_content, sentiment y private.

La tabla cw.reporting_events te resuelve métricas operativas de SLA y tiempos. El endpoint reporting_events devuelve id, name, value, value_in_business_hours, event_start_time, event_end_time, conversation_id, inbox_id, user_id, created_at y updated_at, además de paginación y filtros por rango.

La tabla cw.daily_metrics es la que “congela” cada día para que tu dashboard histórico nunca dependa de que Chatwoot siga guardando datos. Para poblarla, puedes usar directamente reports/summary, que trae conversations_count, incoming_messages_count, outgoing_messages_count, avg_first_response_time, avg_resolution_time y resolutions_count, y también reports v2, que devuelve series por metric, type, id, since y until.

Cómo debe funcionar la automatización diaria

Yo la dejaría así:

Fase 0, una sola vez por empresa: bootstrap.
Sincronizas inboxes, teams, custom attribute definitions, contactos resueltos, conversaciones existentes y mensajes históricos. Esto se hace al crear el nuevo chatbot y la nueva base. Los endpoints de inboxes, teams y custom attributes están documentados; contacts y conversations son paginados, así que el bootstrap debe recorrer páginas completas.

Fase 1, cada día: delta diario.

Lees cw.sync_cursor para obtener since y until.
Consultas reporting_events por ese rango.
De ahí extraes conversation_id afectados.
Para cada conversación afectada, llamas a conversation details y messages.
Si la conversación tiene contact_id, refrescas también show contact.
Haces upsert en contacts_current, conversations_current, messages, reporting_events y raw_ingest.
Los triggers te generan históricos de atributos, labels y etapa.
Al final calculas daily_metrics y actualizas el cursor.
Esto funciona incluso si no hubo bot ni etiquetas, porque el movimiento de la conversación sigue saliendo por conversación, mensajes y reporting events.

Fase 2, una vez por semana: reparación completa.
Como conversations list no tiene un filtro “updated_since”, te conviene una reconciliación semanal que recorra conversaciones por status y páginas para asegurar que no se escapó nada por errores del job diario.

Cómo calcular tus KPIs con este esquema

Con este modelo, ya puedes sacar todo lo que me pediste:

Total general de leads
count(distinct lead_identity_key) sobre cw.contacts_current.
Si todavía no tienes teléfono/correo/identifier, puedes usar un fallback temporal propio hasta que el contacto quede resuelto.

Únicos del día
count(distinct lead_identity_key) donde first_seen_at::date = X.

Actividades del día
Tú decides la definición. La más estable suele ser: count(distinct chatwoot_conversation_id) donde hubo mensajes ese día, o count(*) de mensajes del día si quieres volumen. Como también guardas last_activity_at_chatwoot, puedes hacer ambas.

Leads por etiqueta actual
Desde cw.conversations_current.labels.

Leads sin etiqueta
cardinality(labels) = 0.

Etapa actual
Desde cw.conversations_current.business_stage_current.

Histórico de cambios de etapa
Desde cw.business_stage_history.

Tiempo de respuesta / resolución
Desde cw.reporting_events y/o cw.daily_metrics.

Detalle de conversaciones
Desde cw.conversations_current + cw.messages + cw.contacts_current.

La decisión importante sobre los atributos dinámicos

Aquí está la parte más importante de todas:

No intentes crear columnas nuevas automáticamente cada vez que aparezca un atributo nuevo.
Eso te va a volver inmanejable el esquema.
La solución correcta es esta:

el catálogo de “qué atributos existen” va en cw.attribute_definitions,
el valor actual va en custom_attributes jsonb,
y los cambios van en *_attribute_history.

Eso es exactamente lo que hace que la automatización se adapte sola a cualquier empresa sin reescribir la base. Y es coherente con cómo Chatwoot modela y expone los custom attributes en su API.

Mi recomendación final

Tu módulo “Hubs automatización” debería hacer esto:

crear estas tablas en la base nueva de esa empresa,
guardar la configuración de la cuenta de Chatwoot,
correr bootstrap inicial,
correr delta diario por reporting_events,
refrescar detalles de conversaciones tocadas,
guardar todo el payload crudo,
y recalcular métricas diarias congeladas.

Así, cuando luego migres a Chatwoot Cloud, tu dashboard histórico ya no dependerá de la retención de Chatwoot, porque la fuente histórica real será la base de esa empresa.

En el siguiente paso te puedo dejar el SQL de UPSERT para contacts_current, conversations_current, messages, attribute_definitions y reporting_events, ya listo para que lo llames desde n8n o desde tu backend.