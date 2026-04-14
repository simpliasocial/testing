/**
 * SCRIPT DE SINCRONIZACIÓN AUTOMÁTICA (12:01 AM)
 * Ejecutar con: `node cron_sync.cjs`
 */
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 1. Cargar .env manualmente
const envPath = path.resolve(__dirname, '.env');
const envFile = fs.readFileSync(envPath, 'utf8');
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

const CHATWOOT_URL = `${env.VITE_CHATWOOT_BASE_URL}/api/v1/accounts/${env.VITE_CHATWOOT_ACCOUNT_ID}`;
const API_TOKEN = env.VITE_CHATWOOT_API_TOKEN;
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

function parseNumber(val) {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const clean = val.toString().replace(/[^0-9.-]/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

async function apiGet(endpoint, params = {}) {
    const response = await axios.get(`${CHATWOOT_URL}${endpoint}`, {
        headers: { api_access_token: API_TOKEN },
        params: params
    });
    const rawBody = response.data.data || response.data;
    return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
}

async function runDailySync() {
    console.log(`[${new Date().toISOString()}] 🚀 Iniciando Sincronización Nocturna...`);

    try {
        console.log('📦 Sincronizando Inboxes y Definiciones...');
        const inboxes = await apiGet('/inboxes');
        if (inboxes.length) await supabase.schema('cw').from('inboxes').upsert(inboxes.map(i => ({
            chatwoot_inbox_id: i.id, name: i.name, channel_type: i.channel_type, updated_at: new Date().toISOString()
        })), { onConflict: 'chatwoot_inbox_id' });

        console.log('💬 Sincronizando Conversaciones Activas...');
        let page = 1;
        let totalConvs = 0;

        while (true) {
            const convs = await apiGet('/conversations', { page, status: 'all', assignee_type: 'all' });
            if (!convs || convs.length === 0) break;

            // 1. INYECTAR CONTACTOS DIRECTAMENTE DESDE LA CONVERSACIÓN (Para evitar FK errors)
            const senders = convs.filter(c => c.meta?.sender).map(c => {
                const contact = c.meta.sender;
                const attrs = contact.custom_attributes || {};
                return {
                    chatwoot_contact_id: contact.id,
                    name: contact.name,
                    phone_number: contact.phone_number,
                    email: contact.email,
                    created_at_chatwoot: contact.created_at ? new Date(contact.created_at * 1000).toISOString() : null,
                    updated_at: new Date().toISOString()
                }
            });

            if (senders.length) {
                // Upserting senders individually to prevent duplicate key crashes in massive parallel arrays
                const uniqueSendersMap = new Map();
                senders.forEach(s => uniqueSendersMap.set(s.chatwoot_contact_id, s));
                const { error: contactErr } = await supabase.schema('cw').from('contacts_current').upsert(Array.from(uniqueSendersMap.values()), { onConflict: 'chatwoot_contact_id' });
                if (contactErr) console.error("Error inserting contacts:", contactErr);
            }

            // 2. INYECTAR CONVERSACIONES
            const rows = convs.map(conv => {
                const attrs = { ...(conv.meta?.sender?.custom_attributes || {}), ...(conv.custom_attributes || {}) };
                return {
                    chatwoot_conversation_id: conv.id,
                    chatwoot_contact_id: conv.meta?.sender?.id || conv.contact_id,
                    chatwoot_account_id: conv.account_id,
                    chatwoot_inbox_id: conv.inbox_id,
                    assignee_id: conv.assignee_id,
                    status: conv.status,
                    labels: conv.labels || [],
                    nombre_completo: attrs.nombre_completo,
                    agencia: attrs.agencia,
                    celular: attrs.celular,
                    correo: attrs.correo,
                    campana: attrs.campana,
                    ciudad: attrs.ciudad,
                    canal: attrs.canal,
                    agente: attrs.agente === true || attrs.agente === 'true',
                    score_interes: parseNumber(attrs.score_interes),
                    monto_operacion: parseNumber(attrs.monto_operacion),
                    first_reply_created_at: conv.first_reply_created_at ? new Date(conv.first_reply_created_at * 1000).toISOString() : null,
                    waiting_since: conv.waiting_since ? new Date(conv.waiting_since * 1000).toISOString() : null,
                    created_at_chatwoot: conv.timestamp ? new Date(conv.timestamp * 1000).toISOString() : null,
                    updated_at: new Date().toISOString()
                };
            });

            const { error } = await supabase.schema('cw').from('conversations_current').upsert(rows, { onConflict: 'chatwoot_conversation_id' });
            if (error) console.error(`Error guardando conversaciones pag ${page}:`, error.message);
            else totalConvs += rows.length;

            // 3. INYECTAR MENSAJES (Optimizados y sin JSON blobs)
            for (const conv of convs) {
                try {
                    const msgs = await apiGet(`/conversations/${conv.id}/messages`);
                    if (msgs && msgs.length > 0) {
                        const msgRows = msgs.map(msg => ({
                            chatwoot_message_id: msg.id,
                            chatwoot_conversation_id: msg.conversation_id,
                            chatwoot_account_id: msg.account_id,
                            chatwoot_inbox_id: msg.inbox_id,
                            sender_id: msg.sender?.id,
                            sender_type: msg.sender_type,
                            message_type: msg.message_type,
                            message_direction: msg.message_type === 0 ? 'incoming' : (msg.message_type === 1 ? 'outgoing' : 'activity'),
                            content: msg.content,
                            content_type: msg.content_type,
                            status: msg.status,
                            is_private: msg.private || false,
                            created_at_chatwoot: msg.created_at ? new Date(msg.created_at * 1000).toISOString() : null
                            // DROPPED heavy raw_payload, sender, attachments, and additional attributes completely!
                        }));

                        const { error: msgErr } = await supabase.schema('cw').from('messages').upsert(msgRows, { onConflict: 'chatwoot_message_id' });
                        if (msgErr) console.error(`Error guardando mensajes para conv ${conv.id}:`, msgErr.message);
                    }
                } catch (msgEx) {
                    console.error(`Error de Red descargando mensajes para conv ${conv.id}:`, msgEx.message);
                }
            }

            page++;
        }

        console.log(`[${new Date().toISOString()}] ✅ Sincronización Nocturna COMPLETADA. Conversaciones guardadas: ${totalConvs}`);
    } catch (err) {
        console.error(`[${new Date().toISOString()}] ❌ ERROR CRÍTICO sincronizando:`, err.message);
    }
}

runDailySync();
