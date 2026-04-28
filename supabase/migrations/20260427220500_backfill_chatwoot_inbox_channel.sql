-- Backfill denormalized channel labels from the authoritative Chatwoot inbox.
-- This keeps contact/conversation custom attribute snapshots intact and only fixes
-- the resolved snapshot used by dashboard KPIs, tables and automated reports.

with channel_sources as (
    select
        c.chatwoot_conversation_id,
        c.custom_attributes,
        lower(coalesce(c.raw_payload ->> 'channel_type', '')) as raw_channel_type,
        lower(coalesce(i.channel_type, '')) as inbox_channel_type,
        lower(concat_ws(
            ' ',
            c.raw_payload ->> 'channel_type',
            c.raw_payload ->> 'channel_name',
            c.raw_payload ->> 'source',
            c.raw_payload ->> 'provider',
            c.raw_payload #>> '{additional_attributes,channel}',
            c.raw_payload #>> '{additional_attributes,social_channel}',
            c.raw_payload #>> '{meta,sender,additional_attributes,channel}',
            c.raw_payload #>> '{meta,sender,additional_attributes,social_channel}',
            c.raw_payload #>> '{meta,sender,additional_attributes,provider}',
            c.raw_payload #>> '{meta,sender,additional_attributes,platform}',
            c.raw_payload #>> '{inbox,name}',
            c.raw_payload #>> '{inbox,channel_type}',
            c.raw_payload #>> '{inbox,website_url}',
            i.name,
            i.channel_type,
            i.website_url,
            c.conversation_custom_attributes ->> 'canal',
            c.contact_custom_attributes ->> 'canal',
            c.custom_attributes ->> 'canal',
            c.canal
        )) as fallback_hints
    from cw.conversations_current c
    left join cw.inboxes i
        on i.chatwoot_inbox_id = c.chatwoot_inbox_id
),
resolved as (
    select
        chatwoot_conversation_id,
        custom_attributes,
        case
            when raw_channel_type like '%whatsapp%' or inbox_channel_type like '%whatsapp%' then 'WhatsApp'
            when raw_channel_type like '%instagram%' or inbox_channel_type like '%instagram%' then 'Instagram'
            when raw_channel_type like '%facebook%' or raw_channel_type like '%messenger%'
                or inbox_channel_type like '%facebook%' or inbox_channel_type like '%messenger%' then 'Facebook'
            when raw_channel_type like '%telegram%' or inbox_channel_type like '%telegram%' then 'Telegram'
            when raw_channel_type like '%tiktok%' or inbox_channel_type like '%tiktok%' then 'TikTok'
            when raw_channel_type like '%webwidget%' or raw_channel_type like '%web_widget%' or raw_channel_type like '%website%'
                or inbox_channel_type like '%webwidget%' or inbox_channel_type like '%web_widget%' or inbox_channel_type like '%website%' then 'Sitio web'
            when fallback_hints like '%whatsapp%' or fallback_hints like '%wa.me%' then 'WhatsApp'
            when fallback_hints like '%instagram%' then 'Instagram'
            when fallback_hints like '%facebook%' or fallback_hints like '%messenger%' then 'Facebook'
            when fallback_hints like '%telegram%' or fallback_hints like '%t.me%' then 'Telegram'
            when fallback_hints like '%tiktok%' or fallback_hints like '%tik tok%' then 'TikTok'
            when fallback_hints like '%webwidget%' or fallback_hints like '%web_widget%'
                or fallback_hints like '%web widget%' or fallback_hints like '%website%'
                or fallback_hints like '%web site%' or fallback_hints like '%sitio web%'
                or fallback_hints like '%pagina web%' or fallback_hints like '%livechat%'
                or fallback_hints like '%live chat%' then 'Sitio web'
            else null
        end as resolved_channel
    from channel_sources
)
update cw.conversations_current c
set
    canal = r.resolved_channel,
    custom_attributes = jsonb_set(
        case
            when jsonb_typeof(coalesce(c.custom_attributes, '{}'::jsonb)) = 'object'
                then coalesce(c.custom_attributes, '{}'::jsonb)
            else '{}'::jsonb
        end,
        '{canal}',
        to_jsonb(r.resolved_channel),
        true
    ),
    updated_at = now()
from resolved r
where c.chatwoot_conversation_id = r.chatwoot_conversation_id
  and r.resolved_channel is not null
  and (
      c.canal is distinct from r.resolved_channel
      or lower(coalesce(c.custom_attributes ->> 'canal', '')) in ('', 'otro', 'other', 'unknown', 'sin canal', 'n/a', 'na')
  );
