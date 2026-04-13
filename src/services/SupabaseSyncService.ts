import { supabase } from '../lib/supabase';

export const SupabaseSyncService = {
    // Helper to safely parse any incoming custom attribute to a valid database numeric or null
    parseNumber(val: any): number | null {
        if (val === null || val === undefined || val === '') return null;
        if (typeof val === 'number') return isNaN(val) ? null : val;
        const clean = val.toString().replace(/[^0-9.-]/g, '');
        const num = parseFloat(clean);
        return isNaN(num) ? null : num;
    },

    async upsertRawIngest(data: {
        source_type: 'api' | 'webhook' | 'manual' | 'repair';
        endpoint_name: string;
        event_name?: string;
        entity_type?: string;
        chatwoot_entity_id?: number;
        payload: any;
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

    async upsertInboxes(inboxes: any[]) {
        const rows = inboxes.map(inbox => ({
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
        }));

        const { error } = await supabase
            .schema('cw')
            .from('inboxes')
            .upsert(rows, { onConflict: 'chatwoot_inbox_id' });

        if (error) throw error;
    },

    async upsertTeams(teams: any[]) {
        const rows = teams.map(team => ({
            chatwoot_team_id: team.id,
            name: team.name,
            description: team.description,
            allow_auto_assign: team.allow_auto_assign,
            is_member: team.is_member,
            raw_payload: team,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .schema('cw')
            .from('teams')
            .upsert(rows, { onConflict: 'chatwoot_team_id' });

        if (error) throw error;
    },

    async upsertAttributeDefinitions(defs: any[]) {
        const rows = defs.map(def => ({
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
            created_at_chatwoot: def.created_at ? (typeof def.created_at === 'number' ? new Date(def.created_at * 1000).toISOString() : new Date(def.created_at).toISOString()) : null,
            updated_at_chatwoot: def.updated_at ? (typeof def.updated_at === 'number' ? new Date(def.updated_at * 1000).toISOString() : new Date(def.updated_at).toISOString()) : null,
            raw_payload: def,
            updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
            .schema('cw')
            .from('attribute_definitions')
            .upsert(rows, { onConflict: 'chatwoot_attribute_id' });

        if (error) throw error;
    },

    async upsertContacts(contacts: any[]) {
        const rows = contacts.map(contact => {
            // Identity key logic: priority Phone > Email > Identifier > fallback
            const identityKey = contact.phone_number || contact.email || contact.identifier || `cw_${contact.id}`;
            const attrs = contact.custom_attributes || {};

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
                additional_attributes: contact.additional_attributes || {},
                custom_attributes: attrs,

                // Dropped mapped business attributes from contacts_current because they only exist on conversations_current

                created_at_chatwoot: contact.created_at ? new Date(contact.created_at * 1000).toISOString() : null,
                last_activity_at_chatwoot: contact.last_activity_at ? new Date(contact.last_activity_at * 1000).toISOString() : null,
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
        for (const contact of contacts) {
            if (contact.contact_inboxes && contact.contact_inboxes.length > 0) {
                const inboxRows = contact.contact_inboxes.map((ci: any) => ({
                    chatwoot_contact_id: contact.id,
                    chatwoot_inbox_id: ci.inbox?.id,
                    source_id: ci.source_id,
                    inbox_name: ci.inbox?.name,
                    channel_type: ci.inbox?.channel_type,
                    raw_payload: ci,
                    updated_at: new Date().toISOString()
                }));
                await supabase
                    .schema('cw')
                    .from('contact_inboxes')
                    .upsert(inboxRows, { onConflict: 'chatwoot_contact_id, chatwoot_inbox_id, source_id' });
            }
        }
    },

    async upsertConversations(conversations: any[]) {
        const rows = conversations.map(conv => {
            const contactAttrs = conv.meta?.sender?.custom_attributes || {};
            const convAttrs = conv.custom_attributes || {};

            // Merged attributes with conversation priority
            const attrs = { ...contactAttrs, ...convAttrs };

            return {
                chatwoot_conversation_id: conv.id,
                chatwoot_contact_id: conv.meta?.sender?.id || conv.contact_id,
                chatwoot_account_id: conv.account_id,
                chatwoot_inbox_id: conv.inbox_id,
                chatwoot_team_id: conv.team_id,
                assignee_id: conv.assignee_id,
                uuid: conv.uuid,
                status: conv.status,
                priority: conv.priority,
                can_reply: conv.can_reply,
                muted: conv.muted,
                snoozed_until: conv.snoozed_until ? new Date(conv.snoozed_until * 1000).toISOString() : null,
                unread_count: conv.unread_count,
                labels: conv.labels || [],
                business_stage_current: attrs.business_stage,
                additional_attributes: conv.additional_attributes || {},
                custom_attributes: attrs,
                meta: conv.meta || {},

                // Mapped Business Attributes
                nombre_completo: attrs.nombre_completo,
                fecha_visita: attrs.fecha_visita,
                hora_visita: attrs.hora_visita,
                agencia: attrs.agencia,
                celular: attrs.celular,
                correo: attrs.correo,
                campana: attrs.campana,
                ciudad: attrs.ciudad,
                edad: attrs.edad,
                canal: attrs.canal,
                agente: attrs.agente === true || attrs.agente === 'true',
                score_interes: SupabaseSyncService.parseNumber(attrs.score_interes),
                monto_operacion: SupabaseSyncService.parseNumber(attrs.monto_operacion),
                fecha_monto_operacion: attrs.fecha_monto_operacion,

                applied_sla: conv.applied_sla || {},
                sla_events: conv.sla_events || [],
                last_activity_at_chatwoot: conv.last_activity_at ? new Date(conv.last_activity_at * 1000).toISOString() : null,
                created_at_chatwoot: conv.timestamp ? new Date(conv.timestamp * 1000).toISOString() : null,
                updated_at_chatwoot: new Date().toISOString(),
                raw_payload: conv,
                updated_at: new Date().toISOString()
            };
        });

        const { error } = await supabase
            .schema('cw')
            .from('conversations_current')
            .upsert(rows, { onConflict: 'chatwoot_conversation_id' });

        if (error) throw error;
    },

    async upsertMessages(messages: any[]) {
        const rows = messages.map(msg => ({
            chatwoot_message_id: msg.id,
            chatwoot_conversation_id: msg.conversation_id,
            chatwoot_contact_id: msg.sender?.id,
            chatwoot_account_id: msg.account_id,
            chatwoot_inbox_id: msg.inbox_id,
            sender_id: msg.sender?.id,
            sender_type: msg.sender_type,
            message_type: msg.message_type,
            message_direction: msg.message_type === 0 ? 'incoming' : (msg.message_type === 1 ? 'outgoing' : 'activity'),
            content: msg.content,
            content_type: msg.content_type,
            content_attributes: msg.content_attributes || {},
            additional_attributes: msg.additional_attributes || {},
            external_source_ids: msg.external_source_ids || {},
            attachments: msg.attachments || [],
            sender: msg.sender || {},
            sentiment: msg.sentiment || {},
            status: msg.status,
            is_private: msg.private || false,
            created_at_chatwoot: msg.created_at ? new Date(msg.created_at * 1000).toISOString() : null,
            raw_payload: msg
        }));

        const { error } = await supabase
            .schema('cw')
            .from('messages')
            .upsert(rows, { onConflict: 'chatwoot_message_id' });

        if (error) throw error;
    },

    async upsertReportingEvents(events: any[]) {
        const rows = events.map(ev => ({
            chatwoot_reporting_event_id: ev.id,
            name: ev.name,
            value: ev.value,
            value_in_business_hours: ev.value_in_business_hours,
            event_start_time: ev.event_start_time ? new Date(ev.event_start_time * 1000).toISOString() : null,
            event_end_time: ev.event_end_time ? new Date(ev.event_end_time * 1000).toISOString() : null,
            chatwoot_account_id: ev.account_id,
            chatwoot_conversation_id: ev.conversation_id,
            chatwoot_inbox_id: ev.inbox_id,
            chatwoot_user_id: ev.user_id,
            created_at_chatwoot: ev.created_at ? new Date(ev.created_at * 1000).toISOString() : null,
            updated_at_chatwoot: ev.updated_at ? new Date(ev.updated_at * 1000).toISOString() : null,
            raw_payload: ev
        }));

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

    async endSyncRun(runId: number, status: 'success' | 'error' | 'partial', stats: any, errorMessage?: string) {
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

    async updateSyncCursor(name: string, since: string, until: string, payload: any = {}) {
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
