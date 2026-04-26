-- Chatwoot current-state snapshots and reliable daily sync.
-- Additive only: keeps historical data and recalculates denormalized fields
-- from conversation attrs first, contact attrs second, legacy snapshot last.

alter table cw.conversations_current
    add column if not exists conversation_custom_attributes jsonb not null default '{}'::jsonb,
    add column if not exists contact_custom_attributes jsonb not null default '{}'::jsonb;

with prepared as (
    select
        chatwoot_conversation_id,
        case
            when jsonb_typeof(contact_custom_attributes) = 'object' and contact_custom_attributes <> '{}'::jsonb then contact_custom_attributes
            when jsonb_typeof(raw_payload #> '{meta,sender,custom_attributes}') = 'object' then raw_payload #> '{meta,sender,custom_attributes}'
            when jsonb_typeof(meta #> '{sender,custom_attributes}') = 'object' then meta #> '{sender,custom_attributes}'
            else '{}'::jsonb
        end as next_contact_attrs,
        case
            when jsonb_typeof(conversation_custom_attributes) = 'object' and conversation_custom_attributes <> '{}'::jsonb then conversation_custom_attributes
            when jsonb_typeof(raw_payload -> 'custom_attributes') = 'object' then raw_payload -> 'custom_attributes'
            else '{}'::jsonb
        end as next_conversation_attrs,
        case
            when jsonb_typeof(custom_attributes) = 'object' then custom_attributes
            else '{}'::jsonb
        end as legacy_snapshot
    from cw.conversations_current
),
resolved as (
    select
        chatwoot_conversation_id,
        next_contact_attrs,
        next_conversation_attrs,
        legacy_snapshot || next_contact_attrs || next_conversation_attrs as resolved_attrs
    from prepared
)
update cw.conversations_current c
set
    contact_custom_attributes = r.next_contact_attrs,
    conversation_custom_attributes = r.next_conversation_attrs,
    custom_attributes = r.resolved_attrs,
    nombre_completo = nullif(r.resolved_attrs ->> 'nombre_completo', ''),
    fecha_visita = nullif(r.resolved_attrs ->> 'fecha_visita', ''),
    hora_visita = nullif(r.resolved_attrs ->> 'hora_visita', ''),
    agencia = nullif(r.resolved_attrs ->> 'agencia', ''),
    celular = nullif(r.resolved_attrs ->> 'celular', ''),
    correo = nullif(r.resolved_attrs ->> 'correo', ''),
    campana = nullif(r.resolved_attrs ->> 'campana', ''),
    ciudad = nullif(r.resolved_attrs ->> 'ciudad', ''),
    edad = nullif(r.resolved_attrs ->> 'edad', ''),
    canal = nullif(r.resolved_attrs ->> 'canal', ''),
    agente = case
        when lower(coalesce(r.resolved_attrs ->> 'agente', '')) in ('true', '1', 'yes', 'si', 'sí') then true
        when lower(coalesce(r.resolved_attrs ->> 'agente', '')) in ('false', '0', 'no') then false
        else c.agente
    end,
    score_interes = case
        when nullif(r.resolved_attrs ->> 'score_interes', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (r.resolved_attrs ->> 'score_interes')::numeric
        else c.score_interes
    end,
    monto_operacion = coalesce(nullif(r.resolved_attrs ->> 'monto_operacion', ''), c.monto_operacion),
    fecha_monto_operacion = case
        when nullif(r.resolved_attrs ->> 'fecha_monto_operacion', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            then (r.resolved_attrs ->> 'fecha_monto_operacion')::timestamptz
        else c.fecha_monto_operacion
    end,
    updated_at = now()
from resolved r
where c.chatwoot_conversation_id = r.chatwoot_conversation_id;

create index if not exists idx_cw_conversations_current_created_at_chatwoot
    on cw.conversations_current (created_at_chatwoot desc);

create index if not exists idx_cw_conversations_current_last_activity_at_chatwoot
    on cw.conversations_current (last_activity_at_chatwoot desc);

create index if not exists idx_cw_conversations_current_updated_at_chatwoot
    on cw.conversations_current (updated_at_chatwoot desc);

create index if not exists idx_cw_conversations_current_fecha_monto_operacion
    on cw.conversations_current (fecha_monto_operacion desc);

create index if not exists idx_cw_conversations_current_labels_gin
    on cw.conversations_current using gin (labels);

create index if not exists idx_cw_conversations_current_custom_attrs_gin
    on cw.conversations_current using gin (custom_attributes);

create index if not exists idx_cw_conversations_current_conversation_attrs_gin
    on cw.conversations_current using gin (conversation_custom_attributes);

create index if not exists idx_cw_conversations_current_contact_attrs_gin
    on cw.conversations_current using gin (contact_custom_attributes);

create index if not exists idx_cw_conversations_current_resolved_monto
    on cw.conversations_current ((custom_attributes ->> 'monto_operacion'));

create index if not exists idx_cw_messages_created_at_chatwoot
    on cw.messages (created_at_chatwoot desc);

create or replace view cw.sync_health as
with latest_run as (
    select *
    from cw.sync_runs
    order by started_at desc
    limit 1
),
latest_net as (
    select
        id,
        status_code,
        content,
        timed_out,
        error_msg,
        created
    from net._http_response
    order by created desc
    limit 1
),
active_job as (
    select
        jobid,
        schedule,
        active
    from cron.job
    where jobname = 'sync-chatwoot-diario'
    order by jobid desc
    limit 1
)
select
    lr.id as latest_sync_run_id,
    lr.sync_type,
    lr.status as latest_sync_status,
    lr.started_at,
    lr.finished_at,
    extract(epoch from (coalesce(lr.finished_at, now()) - lr.started_at))::integer as duration_seconds,
    lr.stats,
    lr.error_message,
    nullif(lr.stats ->> 'pages', '')::integer as pages_count,
    nullif(lr.stats ->> 'conversations', '')::integer as conversations_count,
    nullif(lr.stats ->> 'contacts', '')::integer as contacts_count,
    nullif(lr.stats ->> 'messages', '')::integer as messages_count,
    ln.id as latest_pg_net_request_id,
    ln.status_code as latest_pg_net_status_code,
    left(ln.content, 700) as latest_pg_net_content,
    ln.timed_out as latest_pg_net_timed_out,
    ln.error_msg as latest_pg_net_error,
    ln.created as latest_pg_net_created_at,
    aj.jobid as cron_job_id,
    aj.schedule as cron_schedule,
    aj.active as cron_active
from (select 1) anchor
left join latest_run lr on true
left join latest_net ln on true
left join active_job aj on true;

do $$
declare
    table_name text;
    dashboard_tables text[] := array[
        'account_config',
        'sync_cursor',
        'sync_runs',
        'inboxes',
        'teams',
        'attribute_definitions',
        'contacts_current',
        'contact_inboxes',
        'conversations_current',
        'messages',
        'reporting_events',
        'daily_metrics',
        'automated_reports',
        'dashboard_tag_settings',
        'conversation_label_events'
    ];
    protected_tables text[] := array[
        'raw_ingest',
        'contact_attribute_history',
        'conversation_attribute_history',
        'conversation_label_history',
        'business_stage_history'
    ];
begin
    foreach table_name in array dashboard_tables loop
        execute format('alter table cw.%I enable row level security', table_name);

        if not exists (
            select 1
            from pg_policies
            where schemaname = 'cw'
              and tablename = table_name
              and policyname = 'authenticated_all'
        ) then
            execute format(
                'create policy authenticated_all on cw.%I for all to authenticated using (true) with check (true)',
                table_name
            );
        end if;
    end loop;

    foreach table_name in array protected_tables loop
        execute format('alter table cw.%I enable row level security', table_name);
    end loop;
end $$;

revoke all on all tables in schema cw from anon;
grant usage on schema cw to authenticated;
grant select, insert, update, delete on all tables in schema cw to authenticated;
grant usage, select on all sequences in schema cw to authenticated;
grant select on cw.sync_health to authenticated;

do $$
declare
    existing_command text;
    existing_bearer text;
begin
    select command
    into existing_command
    from cron.job
    where jobname = 'sync-chatwoot-diario'
    order by jobid desc
    limit 1;

    existing_bearer := substring(coalesce(existing_command, '') from 'Bearer[[:space:]]+([A-Za-z0-9_.-]+)');

    if not exists (select 1 from vault.secrets where name = 'chatwoot_sync_project_url') then
        perform vault.create_secret(
            'https://oqmjnvbbznzsnecvswex.supabase.co',
            'chatwoot_sync_project_url',
            'Supabase project URL used by pg_cron to invoke chatwoot-sync'
        );
    end if;

    if existing_bearer is not null
       and not exists (select 1 from vault.secrets where name = 'chatwoot_sync_jwt') then
        perform vault.create_secret(
            existing_bearer,
            'chatwoot_sync_jwt',
            'JWT used by pg_cron to invoke chatwoot-sync'
        );
    end if;
end $$;

do $$
declare
    job record;
begin
    for job in
        select jobid
        from cron.job
        where jobname = 'sync-chatwoot-diario'
    loop
        perform cron.unschedule(job.jobid);
    end loop;
end $$;

select cron.schedule(
    'sync-chatwoot-diario',
    '1 5 * * *',
    $$
    select
        net.http_post(
            url := (select decrypted_secret from vault.decrypted_secrets where name = 'chatwoot_sync_project_url') || '/functions/v1/chatwoot-sync',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chatwoot_sync_jwt')
            ),
            body := '{"mode":"full","window_hours":72,"sync_messages":"recent"}'::jsonb,
            timeout_milliseconds := 60000
        ) as request_id;
    $$
)
where not exists (
    select 1
    from cron.job
    where jobname = 'sync-chatwoot-diario'
);
