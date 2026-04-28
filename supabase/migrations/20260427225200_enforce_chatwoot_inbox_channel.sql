-- Keep the resolved dashboard channel coherent even if an older writer omits it.
-- Chatwoot inbox metadata is the authoritative source for the transport channel.

create or replace function cw.resolve_chatwoot_channel_label(
    p_raw_payload jsonb,
    p_custom_attributes jsonb,
    p_contact_custom_attributes jsonb,
    p_conversation_custom_attributes jsonb,
    p_current_canal text,
    p_inbox_id bigint
)
returns text
language plpgsql
stable
as $$
declare
    v_inbox record;
    v_raw_channel_type text := lower(coalesce(p_raw_payload ->> 'channel_type', ''));
    v_inbox_channel_type text := '';
    v_hints text;
    v_clean_current text := nullif(btrim(coalesce(p_current_canal, '')), '');
    v_clean_attr text := nullif(btrim(coalesce(
        p_conversation_custom_attributes ->> 'canal',
        p_contact_custom_attributes ->> 'canal',
        p_custom_attributes ->> 'canal',
        ''
    )), '');
begin
    select i.name, i.channel_type, i.website_url, i.website_token
      into v_inbox
      from cw.inboxes i
     where i.chatwoot_inbox_id = p_inbox_id
     limit 1;

    v_inbox_channel_type := lower(coalesce(v_inbox.channel_type, ''));

    v_hints := lower(concat_ws(
        ' ',
        p_raw_payload ->> 'channel_type',
        p_raw_payload ->> 'channel_name',
        p_raw_payload ->> 'source',
        p_raw_payload ->> 'provider',
        p_raw_payload #>> '{additional_attributes,channel}',
        p_raw_payload #>> '{additional_attributes,social_channel}',
        p_raw_payload #>> '{meta,sender,additional_attributes,channel}',
        p_raw_payload #>> '{meta,sender,additional_attributes,social_channel}',
        p_raw_payload #>> '{meta,sender,additional_attributes,provider}',
        p_raw_payload #>> '{meta,sender,additional_attributes,platform}',
        p_raw_payload #>> '{inbox,name}',
        p_raw_payload #>> '{inbox,channel_type}',
        p_raw_payload #>> '{inbox,website_url}',
        v_inbox.name,
        v_inbox.channel_type,
        v_inbox.website_url,
        v_inbox.website_token,
        v_clean_attr,
        v_clean_current
    ));

    return case
        when v_raw_channel_type like '%whatsapp%' or v_inbox_channel_type like '%whatsapp%' then 'WhatsApp'
        when v_raw_channel_type like '%instagram%' or v_inbox_channel_type like '%instagram%' then 'Instagram'
        when v_raw_channel_type like '%facebook%' or v_raw_channel_type like '%messenger%'
            or v_inbox_channel_type like '%facebook%' or v_inbox_channel_type like '%messenger%' then 'Facebook'
        when v_raw_channel_type like '%telegram%' or v_inbox_channel_type like '%telegram%' then 'Telegram'
        when v_raw_channel_type like '%tiktok%' or v_inbox_channel_type like '%tiktok%' then 'TikTok'
        when v_raw_channel_type like '%webwidget%' or v_raw_channel_type like '%web_widget%' or v_raw_channel_type like '%website%'
            or v_inbox_channel_type like '%webwidget%' or v_inbox_channel_type like '%web_widget%' or v_inbox_channel_type like '%website%' then 'Sitio web'
        when v_hints like '%whatsapp%' or v_hints like '%wa.me%' then 'WhatsApp'
        when v_hints like '%instagram%' then 'Instagram'
        when v_hints like '%facebook%' or v_hints like '%messenger%' then 'Facebook'
        when v_hints like '%telegram%' or v_hints like '%t.me%' then 'Telegram'
        when v_hints like '%tiktok%' or v_hints like '%tik tok%' then 'TikTok'
        when v_hints like '%webwidget%' or v_hints like '%web_widget%'
            or v_hints like '%web widget%' or v_hints like '%website%'
            or v_hints like '%web site%' or v_hints like '%sitio web%'
            or v_hints like '%pagina web%' or v_hints like '%livechat%'
            or v_hints like '%live chat%' then 'Sitio web'
        when lower(coalesce(v_clean_current, '')) not in ('', 'otro', 'other', 'unknown', 'sin canal', 'n/a', 'na') then v_clean_current
        when lower(coalesce(v_clean_attr, '')) not in ('', 'otro', 'other', 'unknown', 'sin canal', 'n/a', 'na') then v_clean_attr
        else null
    end;
end;
$$;

create or replace function cw.set_resolved_chatwoot_channel()
returns trigger
language plpgsql
as $$
declare
    v_resolved_channel text;
begin
    v_resolved_channel := cw.resolve_chatwoot_channel_label(
        coalesce(new.raw_payload, '{}'::jsonb),
        coalesce(new.custom_attributes, '{}'::jsonb),
        coalesce(new.contact_custom_attributes, '{}'::jsonb),
        coalesce(new.conversation_custom_attributes, '{}'::jsonb),
        new.canal,
        new.chatwoot_inbox_id
    );

    if v_resolved_channel is not null then
        new.canal := v_resolved_channel;
        new.custom_attributes := jsonb_set(
            case
                when jsonb_typeof(coalesce(new.custom_attributes, '{}'::jsonb)) = 'object'
                    then coalesce(new.custom_attributes, '{}'::jsonb)
                else '{}'::jsonb
            end,
            '{canal}',
            to_jsonb(v_resolved_channel),
            true
        );
    end if;

    return new;
end;
$$;

drop trigger if exists conversations_current_resolve_channel_biu on cw.conversations_current;

create trigger conversations_current_resolve_channel_biu
before insert or update of
    chatwoot_inbox_id,
    raw_payload,
    canal,
    custom_attributes,
    contact_custom_attributes,
    conversation_custom_attributes
on cw.conversations_current
for each row
execute function cw.set_resolved_chatwoot_channel();
