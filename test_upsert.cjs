const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        let val = parts.slice(1).join('=').trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        env[parts[0].trim()] = val;
    }
});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function parseNumber(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const clean = val.toString().replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

(async () => {
    try {
        console.log('Fetching conversations from Chatwoot...');
        const url = `${env.VITE_CHATWOOT_BASE_URL}/api/v1/accounts/${env.VITE_CHATWOOT_ACCOUNT_ID}/conversations`;
        const res = await axios.get(url, {
            headers: { api_access_token: env.VITE_CHATWOOT_API_TOKEN },
            params: { assignee_type: 'all' }
        });

        const rawBody = res.data.data || res.data;
        const convs = Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
        console.log(`Found ${convs.length} conversations. Upserting to Supabase...`);

        const rows = convs.map(conv => {
            const contactAttrs = conv.meta?.sender?.custom_attributes || {};
            const convAttrs = conv.custom_attributes || {};
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
                score_interes: parseNumber(attrs.score_interes),
                monto_operacion: parseNumber(attrs.monto_operacion),
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

        const { data, error } = await supabase
            .schema('cw')
            .from('conversations_current')
            .upsert(rows, { onConflict: 'chatwoot_conversation_id' })
            .select();

        if (error) {
            console.error('Supabase Upsert Error:', error);
        } else {
            console.log('Upsert Success! Rows inserted/updated:', data?.length);
        }
    } catch (err) {
        console.error('Script Error:', err.message);
    }
})();
