-- Separate current commercial accounting from historical commercial audit.

alter table cw.conversation_attribute_history
    add column if not exists event_key text;

alter table cw.contact_attribute_history
    add column if not exists event_key text;

update cw.conversation_attribute_history
set event_key = concat_ws(':', 'conversation_attr', id::text)
where event_key is null;

update cw.contact_attribute_history
set event_key = concat_ws(':', 'contact_attr', id::text)
where event_key is null;

create unique index if not exists conversation_attribute_history_event_key_idx
    on cw.conversation_attribute_history (event_key)
    where event_key is not null;

create unique index if not exists contact_attribute_history_event_key_idx
    on cw.contact_attribute_history (event_key)
    where event_key is not null;

with resolved as (
    select
        chatwoot_conversation_id,
        coalesce(contact_custom_attributes, '{}'::jsonb)
            || coalesce(conversation_custom_attributes, '{}'::jsonb) as attrs
    from cw.conversations_current
)
update cw.conversations_current c
set
    custom_attributes = r.attrs,
    nombre_completo = nullif(r.attrs ->> 'nombre_completo', ''),
    fecha_visita = nullif(r.attrs ->> 'fecha_visita', ''),
    hora_visita = nullif(r.attrs ->> 'hora_visita', ''),
    agencia = nullif(r.attrs ->> 'agencia', ''),
    celular = nullif(r.attrs ->> 'celular', ''),
    correo = nullif(r.attrs ->> 'correo', ''),
    campana = nullif(r.attrs ->> 'campana', ''),
    ciudad = nullif(r.attrs ->> 'ciudad', ''),
    edad = nullif(r.attrs ->> 'edad', ''),
    canal = coalesce(nullif(r.attrs ->> 'canal', ''), c.canal),
    business_stage_current = nullif(r.attrs ->> 'business_stage', ''),
    agente = case
        when lower(coalesce(r.attrs ->> 'agente', '')) in ('true', '1', 'yes', 'si', 'sí') then true
        when lower(coalesce(r.attrs ->> 'agente', '')) in ('false', '0', 'no') then false
        else null
    end,
    score_interes = case
        when nullif(r.attrs ->> 'score_interes', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (r.attrs ->> 'score_interes')::numeric
        else null
    end,
    monto_operacion = nullif(r.attrs ->> 'monto_operacion', ''),
    fecha_monto_operacion = case
        when nullif(r.attrs ->> 'fecha_monto_operacion', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            then (r.attrs ->> 'fecha_monto_operacion')::timestamptz
        else null
    end,
    updated_at = now()
from resolved r
where c.chatwoot_conversation_id = r.chatwoot_conversation_id;

create or replace view cw.commercial_audit_events as
with tracked_attribute_events as (
    select
        concat('conversation_attr:', h.id::text) as event_key,
        h.id,
        h.chatwoot_conversation_id,
        case
            when h.attribute_key = 'monto_operacion'
                 and h.old_value is not null
                 and (h.new_value is null or h.new_value::text in ('null', '""'))
                then 'monto_eliminado'
            when h.attribute_key = 'monto_operacion'
                then 'monto_actualizado'
            else 'atributo_comercial_actualizado'
        end as event_type,
        h.attribute_key as field_name,
        h.attribute_key,
        h.old_value as previous_value,
        h.new_value as current_value,
        h.old_value as historical_value,
        h.changed_at,
        h.created_at as detected_at,
        h.change_source,
        case
            when h.attribute_key = 'monto_operacion'
                 and h.old_value is not null
                 and (h.new_value is null or h.new_value::text in ('null', '""'))
                then 'monto_eliminado'
            when h.attribute_key = 'monto_operacion'
                then 'monto_actualizado'
            else 'dato_comercial_actualizado'
        end as business_impact,
        jsonb_build_object('source_table', 'conversation_attribute_history') as raw_payload
    from cw.conversation_attribute_history h
    where h.attribute_key in (
        'monto_operacion',
        'fecha_monto_operacion',
        'score_interes',
        'score',
        'lead_score',
        'puntaje',
        'responsable',
        'campana',
        'utm_campaign',
        'business_stage'
    )
),
tracked_contact_attribute_events as (
    select
        concat('contact_attr:', h.id::text, ':', c.chatwoot_conversation_id::text) as event_key,
        h.id,
        c.chatwoot_conversation_id,
        'atributo_comercial_contacto_actualizado' as event_type,
        h.attribute_key as field_name,
        h.attribute_key,
        h.old_value as previous_value,
        h.new_value as current_value,
        h.old_value as historical_value,
        h.changed_at,
        h.created_at as detected_at,
        h.change_source,
        'dato_comercial_actualizado' as business_impact,
        jsonb_build_object('source_table', 'contact_attribute_history') as raw_payload
    from cw.contact_attribute_history h
    join cw.conversations_current c
      on c.chatwoot_contact_id = h.chatwoot_contact_id
    where h.attribute_key in (
        'monto_operacion',
        'fecha_monto_operacion',
        'score_interes',
        'score',
        'lead_score',
        'puntaje',
        'responsable',
        'campana',
        'utm_campaign'
    )
),
tracked_label_events as (
    select
        concat('label_event:', e.id::text) as event_key,
        e.id,
        e.chatwoot_conversation_id,
        case
            when not (coalesce(c.labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[])
                 and (
                    coalesce(e.previous_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.next_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.added_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.removed_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                 )
                then 'venta_historica_no_vigente'
            else 'evento_etiqueta_venta'
        end as event_type,
        'labels'::text as field_name,
        'labels'::text as attribute_key,
        to_jsonb(e.previous_labels) as previous_value,
        to_jsonb(e.next_labels) as current_value,
        to_jsonb(e.previous_labels) as historical_value,
        e.occurred_at as changed_at,
        e.detected_at,
        e.event_source as change_source,
        case
            when not (coalesce(c.labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[])
                 and (
                    coalesce(e.previous_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.next_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.added_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                    or coalesce(e.removed_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
                 )
                then 'venta_historica_no_vigente'
            else 'evento_etiqueta_venta'
        end as business_impact,
        coalesce(e.raw_payload, '{}'::jsonb)
            || jsonb_build_object('source_table', 'conversation_label_events') as raw_payload
    from cw.conversation_label_events e
    left join cw.conversations_current c
      on c.chatwoot_conversation_id = e.chatwoot_conversation_id
    where
        coalesce(e.previous_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
        or coalesce(e.next_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
        or coalesce(e.added_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
        or coalesce(e.removed_labels, '{}'::text[]) && array['venta_exitosa', 'venta']::text[]
)
select * from tracked_attribute_events
union all
select * from tracked_contact_attribute_events
union all
select * from tracked_label_events;

grant select on cw.commercial_audit_events to authenticated;
grant select on cw.commercial_audit_events to service_role;
