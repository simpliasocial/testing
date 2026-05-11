import type { UnknownRecord } from "../../domain/common/types";
import { asRecord } from "../../domain/common/types";
import { getLabelDelta } from "../../domain/lead";
import { channelLabelFromType } from "../../lib/leadDisplay";
import { supabase } from "../../lib/supabase";

const cleanChannel = (value: unknown) => {
    const text = String(value || '').trim();
    const normalized = text.toLowerCase();
    return normalized && !['otro', 'other', 'unknown', 'sin canal', 'n/a', 'na'].includes(normalized)
        ? text
        : '';
};

const resolveConversationChannel = (conversationValue: unknown, attrs: UnknownRecord) => {
    const conversation = asRecord(conversationValue);
    const inbox = asRecord(conversation.inbox);
    const meta = asRecord(conversation.meta);
    const sender = asRecord(meta.sender);
    const senderAdditional = asRecord(sender.additional_attributes);
    const additionalAttributes = asRecord(conversation.additional_attributes);
    const fallbackHints = [
        attrs.canal,
        conversation.canal,
        conversation.channel,
        conversation.channel_name,
        conversation.source,
        conversation.provider,
        additionalAttributes.channel,
        additionalAttributes.social_channel,
        senderAdditional.channel,
        senderAdditional.social_channel,
        senderAdditional.provider,
        senderAdditional.platform,
        senderAdditional.source,
        inbox.name,
        inbox.website_url,
        inbox.website_token,
        inbox.channel_type,
        inbox.provider,
        inbox.slug
    ].filter(Boolean).join(' ');

    const resolved = channelLabelFromType(String(conversation.channel_type || inbox.channel_type || ''), fallbackHints);
    return resolved !== 'Otro' ? resolved : cleanChannel(attrs.canal) || null;
};

const TRACKED_COMMERCIAL_ATTRIBUTE_KEYS = [
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
];

const asObject = (value: unknown): UnknownRecord => asRecord(value);

const asRecordArray = (value: unknown): UnknownRecord[] =>
    Array.isArray(value) ? value.map(asRecord) : [];

const emptyToNull = (value: unknown) =>
    value === undefined || value === null || value === '' ? null : value;

const stableJson = (value: unknown) => JSON.stringify(value ?? null);

const buildAttributeHistoryRows = (
    conversationId: number,
    previousAttrs: UnknownRecord,
    nextAttrs: UnknownRecord,
    changedAt: string
) => TRACKED_COMMERCIAL_ATTRIBUTE_KEYS
    .map((attributeKey) => {
        const oldValue = emptyToNull(previousAttrs?.[attributeKey]);
        const newValue = emptyToNull(nextAttrs?.[attributeKey]);
        if (stableJson(oldValue) === stableJson(newValue)) return null;

        return {
            chatwoot_conversation_id: conversationId,
            attribute_key: attributeKey,
            old_value: oldValue,
            new_value: newValue,
            changed_at: changedAt,
            change_source: 'sync',
            event_key: ['sync', conversationId, attributeKey, changedAt, stableJson(oldValue), stableJson(newValue)].join(':')
        };
    })
    .filter(Boolean);

export const SupabaseSyncService = {
    // Converts external custom attributes into a database numeric value.
    parseNumber(val: unknown): number | null {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return isNaN(val) ? null : val;
        const clean = val.toString().replace(/[^0-9.-]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    },

    parseDateIso(val: unknown): string {
        if (!val) return new Date().toISOString();
        const numeric = Number(val);
        const date = Number.isNaN(numeric)
            ? new Date(String(val))
            : new Date(numeric < 10000000000 ? numeric * 1000 : numeric);
        return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    },

    async upsertRawIngest(data: {
        source_type: 'api' | 'webhook' | 'manual' | 'repair';
        endpoint_name: string;
        event_name?: string;
        entity_type?: string;
        chatwoot_entity_id?: number;
        payload: unknown;
    }) {
        const { error } = await supabase
            .schema('cw')
            .from('raw_ingest')
            .insert({
                source_type: data.source_type,
                endpoint_name: data.endpoint_name,
                event_name: data.event_name,
                entity_type: data.entity_type,
                chatwoot_entity_id: data.chatwoot_entity_id,
                payload: data.payload,
                fetched_at: new Date().toISOString()
            });
        if (error) console.error('Error saving raw ingest:', error);
    },

    async upsertInboxes(inboxes: unknown[]) {
        const rows = inboxes.map((inboxValue) => {
            const inbox = asRecord(inboxValue);
            return {
                chatwoot_inbox_id: inbox.id,
                name: inbox.name,
                channel_type: inbox.channel_type,
                avatar_url: inbox.avatar_url,
                widget_color: inbox.widget_color,
                website_token: inbox.website_token,
                enable_auto_assignment: inbox.enable_auto_assignment,
                web_widget_script: inbox.web_widget_script,
                welcome_title: inbox.welcome_title,
                welcome_tagline: inbox.welcome_tagline,
                greeting_enabled: inbox.greeting_enabled,
                raw_payload: inbox,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('inboxes')
            .upsert(rows, { onConflict: 'chatwoot_inbox_id' });

        if (error) throw error;
    },

    async upsertTeams(teams: unknown[]) {
        const rows = teams.map((teamValue) => {
            const team = asRecord(teamValue);
            return {
                chatwoot_team_id: team.id,
                name: team.name,
                description: team.description,
                allow_auto_assign: team.allow_auto_assign,
                is_member: team.is_member,
                raw_payload: team,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('teams')
            .upsert(rows, { onConflict: 'chatwoot_team_id' });

        if (error) throw error;
    },

    async upsertAttributeDefinitions(defs: unknown[]) {
        const rows = defs.map((definitionValue) => {
            const def = asRecord(definitionValue);
            return {
                chatwoot_attribute_id: def.id,
                attribute_scope: def.attribute_model === 0 ? 'conversation' : 'contact', // simplified mapping
                attribute_key: def.attribute_key,
                attribute_display_name: def.attribute_display_name,
                attribute_display_type: def.attribute_display_type,
                attribute_description: def.attribute_description,
                regex_pattern: def.regex_pattern,
                regex_cue: def.regex_cue,
                attribute_values: def.attribute_values,
                attribute_model: def.attribute_model_type,
                default_value: def.default_value,
                created_at_chatwoot: def.created_at ? SupabaseSyncService.parseDateIso(def.created_at) : null,
                updated_at_chatwoot: def.updated_at ? SupabaseSyncService.parseDateIso(def.updated_at) : null,
                raw_payload: def,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('attribute_definitions')
            .upsert(rows, { onConflict: 'chatwoot_attribute_id' });

        if (error) throw error;
    },

    async upsertContacts(contacts: unknown[]) {
        const rows = contacts.map((contactValue) => {
            const contact = asRecord(contactValue);
            // Identity key logic: priority Phone > Email > Identifier > fallback
            const identityKey = contact.phone_number || contact.email || contact.identifier || `cw_${String(contact.id || '')}`;
            const attrs = asRecord(contact.custom_attributes);

            return {
                chatwoot_contact_id: contact.id,
                lead_identity_key: identityKey,
                identifier: contact.identifier,
                name: contact.name,
                phone_number: contact.phone_number,
                email: contact.email,
                blocked: contact.blocked,
                thumbnail: contact.thumbnail,
                availability_status: contact.availability_status,
                additional_attributes: asRecord(contact.additional_attributes),
                custom_attributes: attrs,

                // Dropped mapped business attributes from contacts_current because they only exist on conversations_current

                created_at_chatwoot: contact.created_at ? SupabaseSyncService.parseDateIso(contact.created_at) : null,
                last_activity_at_chatwoot: contact.last_activity_at ? SupabaseSyncService.parseDateIso(contact.last_activity_at) : null,
                raw_payload: contact,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('contacts_current')
            .upsert(rows, { onConflict: 'chatwoot_contact_id' });

        if (error) throw error;

        // Upsert contact inboxes
        for (const contactValue of contacts) {
            const contact = asRecord(contactValue);
            const contactInboxes = asRecordArray(contact.contact_inboxes);
            if (contactInboxes.length > 0) {
                const inboxRows = contactInboxes.map((contactInbox) => {
                    const inbox = asRecord(contactInbox.inbox);
                    return {
                        chatwoot_contact_id: contact.id,
                        chatwoot_inbox_id: inbox.id,
                        source_id: contactInbox.source_id,
                        inbox_name: inbox.name,
                        channel_type: inbox.channel_type,
                        raw_payload: contactInbox,
                        updated_at: new Date().toISOString()
                    };
                });
                await supabase
                    .schema('cw')
                    .from('contact_inboxes')
                    .upsert(inboxRows, { onConflict: 'chatwoot_contact_id, chatwoot_inbox_id, source_id' });
            }
        }
    },

    async upsertConversations(conversations: unknown[]) {
        const conversationIds = conversations.map((conv) => Number(asRecord(conv).id)).filter(Boolean);
        const previousLabelsById = new Map<number, string[]>();
        const previousRowsById = new Map<number, UnknownRecord>();

        if (conversationIds.length > 0) {
            const { data, error } = await supabase
                .schema('cw')
                .from('conversations_current')
                .select('chatwoot_conversation_id, labels, custom_attributes, conversation_custom_attributes, contact_custom_attributes')
                .in('chatwoot_conversation_id', conversationIds);

            if (error) throw error;
            (data || []).forEach((rowValue) => {
                const row = asRecord(rowValue);
                const conversationId = Number(row.chatwoot_conversation_id);
                previousLabelsById.set(conversationId, Array.isArray(row.labels) ? row.labels.map(String) : []);
                previousRowsById.set(conversationId, row);
            });
        }

        const labelEventRows = conversations
            .map((conversationValue) => {
                const conv = asRecord(conversationValue);
                const conversationId = Number(conv.id);
                const delta = getLabelDelta(previousLabelsById.get(conversationId) || [], conv.labels || []);
                if (delta.added.length === 0 && delta.removed.length === 0) return null;

                const occurredAt = SupabaseSyncService.parseDateIso(conv.updated_at || conv.last_activity_at || conv.timestamp);
                return {
                    chatwoot_conversation_id: conversationId,
                    previous_labels: delta.previous,
                    next_labels: delta.next,
                    added_labels: delta.added,
                    removed_labels: delta.removed,
                    event_source: 'sync_diff',
                    occurred_at: occurredAt,
                    detected_at: new Date().toISOString(),
                    raw_payload: { source: 'SupabaseSyncService', previous_labels: delta.previous, next_labels: delta.next },
                    event_key: ['sync_diff', conversationId, occurredAt, delta.previous.join('|'), delta.next.join('|')].join(':')
                };
            })
            .filter(Boolean);

        if (labelEventRows.length > 0) {
            const { error } = await supabase
                .schema('cw')
                .from('conversation_label_events')
                .upsert(labelEventRows, { onConflict: 'event_key', ignoreDuplicates: true });

            if (error) throw error;
        }

        const rows = conversations.map((conversationValue) => {
            const conv = asRecord(conversationValue);
            const meta = asRecord(conv.meta);
            const sender = asRecord(meta.sender);
            const contactAttrs = asRecord(sender.custom_attributes);
            const convAttrs = asRecord(conv.custom_attributes);

            // Merged attributes with conversation priority
            const attrs = { ...contactAttrs, ...convAttrs };
            const canal = resolveConversationChannel(conv, attrs);

            return {
                chatwoot_conversation_id: conv.id,
                chatwoot_contact_id: sender.id || conv.contact_id,
                chatwoot_account_id: conv.account_id,
                chatwoot_inbox_id: conv.inbox_id,
                chatwoot_team_id: conv.team_id,
                assignee_id: conv.assignee_id,
                uuid: conv.uuid,
                status: conv.status,
                priority: conv.priority,
                can_reply: conv.can_reply,
                muted: conv.muted,
                snoozed_until: conv.snoozed_until ? SupabaseSyncService.parseDateIso(conv.snoozed_until) : null,
                unread_count: conv.unread_count,
                labels: Array.isArray(conv.labels) ? conv.labels : [],
                business_stage_current: emptyToNull(attrs.business_stage),
                additional_attributes: asRecord(conv.additional_attributes),
                contact_custom_attributes: contactAttrs,
                conversation_custom_attributes: convAttrs,
                custom_attributes: canal ? { ...attrs, canal } : attrs,
                meta,

                // Mapped Business Attributes
                nombre_completo: emptyToNull(attrs.nombre_completo),
                fecha_visita: emptyToNull(attrs.fecha_visita),
                hora_visita: emptyToNull(attrs.hora_visita),
                agencia: emptyToNull(attrs.agencia),
                celular: emptyToNull(attrs.celular),
                correo: emptyToNull(attrs.correo),
                campana: emptyToNull(attrs.campana),
                ciudad: emptyToNull(attrs.ciudad),
                edad: emptyToNull(attrs.edad),
                canal,
                agente: emptyToNull(attrs.agente) === null ? null : attrs.agente === true || attrs.agente === 'true',
                score_interes: SupabaseSyncService.parseNumber(attrs.score_interes),
                monto_operacion: emptyToNull(attrs.monto_operacion),
                fecha_monto_operacion: attrs.fecha_monto_operacion ? SupabaseSyncService.parseDateIso(attrs.fecha_monto_operacion) : null,

                applied_sla: asRecord(conv.applied_sla),
                sla_events: Array.isArray(conv.sla_events) ? conv.sla_events : [],
                last_activity_at_chatwoot: conv.last_activity_at ? SupabaseSyncService.parseDateIso(conv.last_activity_at) : null,
                created_at_chatwoot: conv.created_at ? SupabaseSyncService.parseDateIso(conv.created_at) : (conv.timestamp ? SupabaseSyncService.parseDateIso(conv.timestamp) : null),
                updated_at_chatwoot: SupabaseSyncService.parseDateIso(conv.updated_at || conv.last_activity_at || conv.timestamp),
                first_reply_created_at_chatwoot: conv.first_reply_created_at ? SupabaseSyncService.parseDateIso(conv.first_reply_created_at) : null,
                waiting_since_chatwoot: conv.waiting_since ? SupabaseSyncService.parseDateIso(conv.waiting_since) : null,
                raw_payload: conv,
                updated_at: new Date().toISOString()
            };
        });

        const attributeHistoryRows = conversations.flatMap((conversationValue) => {
            const conv = asRecord(conversationValue);
            const meta = asRecord(conv.meta);
            const sender = asRecord(meta.sender);
            const conversationId = Number(conv.id);
            const previousRow = previousRowsById.get(conversationId);
            if (!previousRow) return [];

            const contactAttrs = asRecord(sender.custom_attributes);
            const convAttrs = asRecord(conv.custom_attributes);
            const attrs = { ...contactAttrs, ...convAttrs };
            const canal = resolveConversationChannel(conv, attrs);
            const nextAttrs = canal ? { ...attrs, canal } : attrs;
            const previousAttrs = {
                ...asObject(previousRow.contact_custom_attributes),
                ...asObject(previousRow.conversation_custom_attributes),
                ...asObject(previousRow.custom_attributes)
            };
            const changedAt = SupabaseSyncService.parseDateIso(conv.updated_at || conv.last_activity_at || conv.timestamp);
            return buildAttributeHistoryRows(conversationId, previousAttrs, nextAttrs, changedAt);
        });

        if (attributeHistoryRows.length > 0) {
            const { error } = await supabase
                .schema('cw')
                .from('conversation_attribute_history')
                .upsert(attributeHistoryRows, { onConflict: 'event_key', ignoreDuplicates: true });

            if (error) throw error;
        }

        const { error } = await supabase
            .schema('cw')
            .from('conversations_current')
            .upsert(rows, { onConflict: 'chatwoot_conversation_id' });

        if (error) throw error;
    },

    async upsertMessages(messages: unknown[]) {
        const rows = messages.map((messageValue) => {
            const msg = asRecord(messageValue);
            const sender = asRecord(msg.sender);
            return {
                chatwoot_message_id: msg.id,
                chatwoot_conversation_id: msg.conversation_id,
                chatwoot_contact_id: sender.id,
                chatwoot_account_id: msg.account_id,
                chatwoot_inbox_id: msg.inbox_id,
                sender_id: sender.id,
                sender_type: msg.sender_type,
                message_type: msg.message_type,
                message_direction: msg.message_type === 0 ? 'incoming' : (msg.message_type === 1 ? 'outgoing' : 'activity'),
                content: msg.content,
                content_type: msg.content_type,
                content_attributes: asRecord(msg.content_attributes),
                additional_attributes: asRecord(msg.additional_attributes),
                external_source_ids: asRecord(msg.external_source_ids),
                attachments: msg.attachments || [],
                sender,
                sentiment: asRecord(msg.sentiment),
                status: msg.status,
                is_private: Boolean(msg.private),
                created_at_chatwoot: msg.created_at ? SupabaseSyncService.parseDateIso(msg.created_at) : null,
                raw_payload: msg
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('messages')
            .upsert(rows, { onConflict: 'chatwoot_message_id' });

        if (error) throw error;
    },

    async upsertReportingEvents(events: unknown[]) {
        const rows = events.map((eventValue) => {
            const ev = asRecord(eventValue);
            return {
                chatwoot_reporting_event_id: ev.id,
                name: ev.name,
                value: ev.value,
                value_in_business_hours: ev.value_in_business_hours,
                event_start_time: ev.event_start_time ? SupabaseSyncService.parseDateIso(ev.event_start_time) : null,
                event_end_time: ev.event_end_time ? SupabaseSyncService.parseDateIso(ev.event_end_time) : null,
                chatwoot_account_id: ev.account_id,
                chatwoot_conversation_id: ev.conversation_id,
                chatwoot_inbox_id: ev.inbox_id,
                chatwoot_user_id: ev.user_id,
                created_at_chatwoot: ev.created_at ? SupabaseSyncService.parseDateIso(ev.created_at) : null,
                updated_at_chatwoot: ev.updated_at ? SupabaseSyncService.parseDateIso(ev.updated_at) : null,
                raw_payload: ev
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('reporting_events')
            .upsert(rows, { onConflict: 'chatwoot_reporting_event_id' });

        if (error) throw error;
    },

    async startSyncRun(type: string) {
        const { data, error } = await supabase
            .schema('cw')
            .from('sync_runs')
            .insert({
                sync_type: type,
                status: 'running',
                started_at: new Date().toISOString()
            })
            .select()
            .single();
        if (error) throw error;
        return data.id;
    },

    async endSyncRun(runId: number, status: 'success' | 'error' | 'partial', stats: unknown, errorMessage?: string) {
        await supabase
            .schema('cw')
            .from('sync_runs')
            .update({
                status,
                finished_at: new Date().toISOString(),
                stats,
                error_message: errorMessage
            })
            .eq('id', runId);
    },

    async getSyncCursor(name: string) {
        const { data, error } = await supabase
            .schema('cw')
            .from('sync_cursor')
            .select('*')
            .eq('cursor_name', name)
            .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async updateSyncCursor(name: string, since: string, until: string, payload: unknown = {}) {
        await supabase
            .schema('cw')
            .from('sync_cursor')
            .upsert({
                cursor_name: name,
                last_since_ts: since,
                last_until_ts: until,
                cursor_payload: payload,
                updated_at: new Date().toISOString()
            });
    }
};

export const supabaseSyncClient = SupabaseSyncService;
