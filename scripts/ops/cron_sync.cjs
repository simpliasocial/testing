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

        // Build inbox lookup for channel_type and inbox_name
        const inboxMap = new Map();
        inboxes.forEach(i => inboxMap.set(i.id, i));

        console.log('💬 Sincronizando Conversaciones Activas...');
        let page = 1;
        let totalConvs = 0;

        while (true) {
            const convs = await apiGet('/conversations', { page, status: 'all', assignee_type: 'all' });
            if (!convs || convs.length === 0) break;

            // 1. INYECTAR CONTACTOS
            const senders = convs.filter(c => c.meta?.sender).map(c => {
                const contact = c.meta.sender;
                return {
                    chatwoot_contact_id: contact.id,
                    name: contact.name,
                    phone_number: contact.phone_number,
                    email: contact.email,
                    created_at_chatwoot: contact.created_at ? new Date(contact.created_at * 1000).toISOString() : null,
                    updated_at: new Date().toISOString()
                };
            });

            if (senders.length) {
                const uniqueSendersMap = new Map();
                senders.forEach(s => uniqueSendersMap.set(s.chatwoot_contact_id, s));
                const { error: contactErr } = await supabase.schema('cw').from('contacts_current').upsert(Array.from(uniqueSendersMap.values()), { onConflict: 'chatwoot_contact_id' });
                if (contactErr) console.error("Error inserting contacts:", contactErr);
            }

            // 2. INYECTAR CONVERSACIONES — ALL CRITICAL FIELDS
            const rows = convs.map(conv => {
                const senderAttrs = conv.meta?.sender?.custom_attributes || {};
                const convAttrs = conv.custom_attributes || {};
                const attrs = { ...senderAttrs, ...convAttrs };
                const sender = conv.meta?.sender || {};
                const inbox = inboxMap.get(conv.inbox_id);

                // Helper to find external profile URL
                const findUrl = (obj) => {
                    if (!obj) return null;
                    const keys = ['facebook', 'profile_link', 'page_link', 'url', 'link', 'tiktok', 'instagram', 'telegram'];
                    for (const key of keys) {
                        const val = obj[key];
                        if (val && typeof val === 'string' && val.startsWith('http')) return val;
                    }
                    return null;
                };

                let perfil_url = findUrl(attrs) || findUrl(sender.additional_attributes) || findUrl(conv.additional_attributes);

                if (!perfil_url) {
                    const channel = (inbox?.channel_type || conv.channel_type || sender.type || '').toLowerCase();
                    const identifier = sender.identifier || '';
                    if (channel.includes('whatsapp')) {
                        const phone = (sender.phone_number || attrs.celular || '').replace(/\D/g, '');
                        if (phone) perfil_url = `https://wa.me/${phone}`;
                    } else if (channel.includes('tiktok')) {
                        perfil_url = identifier ? `https://www.tiktok.com/@${identifier.replace(/^@/, '')}` : null;
                    } else if (channel.includes('instagram')) {
                        perfil_url = identifier ? `https://www.instagram.com/${identifier.replace(/^@/, '')}` : null;
                    } else if (channel.includes('facebook') || channel.includes('messenger')) {
                        perfil_url = identifier ? `https://facebook.com/${identifier}` : null;
                    } else if (channel.includes('telegram')) {
                        perfil_url = identifier ? `https://t.me/${identifier.replace(/^@/, '')}` : null;
                    }
                }

                // Safe timestamp converter
                const toIso = (ts) => {
                    if (!ts) return null;
                    try {
                        const n = Number(ts);
                        if (!isNaN(n) && n > 0) return new Date(n < 10000000000 ? n * 1000 : n).toISOString();
                        const d = new Date(ts);
                        return isNaN(d.getTime()) ? null : d.toISOString();
                    } catch { return null; }
                };

                const lastMsg = conv.last_non_activity_message;

                return {
                    chatwoot_conversation_id: conv.id,
                    chatwoot_contact_id: sender.id || conv.contact_id,
                    chatwoot_account_id: conv.account_id,
                    chatwoot_inbox_id: conv.inbox_id,
                    assignee_id: conv.assignee_id,
                    status: conv.status,
                    labels: conv.labels || [],
                    // Rich JSONB snapshots from Chatwoot API
                    meta: conv.meta || {},
                    custom_attributes: convAttrs,
                    additional_attributes: conv.additional_attributes || {},
                    raw_payload: conv,
                    // Denormalized contact attributes
                    nombre_completo: attrs.nombre_completo || null,
                    agencia: attrs.agencia || null,
                    celular: attrs.celular || null,
                    correo: attrs.correo || null,
                    campana: attrs.campana || null,
                    ciudad: attrs.ciudad || null,
                    canal: attrs.canal || null,
                    edad: attrs.edad || null,
                    fecha_visita: attrs.fecha_visita || null,
                    hora_visita: attrs.hora_visita || null,
                    perfil_url: perfil_url,
                    agente: attrs.agente === true || attrs.agente === 'true',
                    score_interes: parseNumber(attrs.score_interes),
                    monto_operacion: attrs.monto_operacion != null ? String(attrs.monto_operacion) : null,
                    fecha_monto_operacion: attrs.fecha_monto_operacion ? toIso(new Date(attrs.fecha_monto_operacion).getTime() / 1000) : null,
                    // Inbox metadata
                    inbox_name: inbox?.name || null,
                    channel_type: inbox?.channel_type || null,
                    // Timestamps
                    first_reply_created_at_chatwoot: toIso(conv.first_reply_created_at),
                    waiting_since_chatwoot: toIso(conv.waiting_since),
                    last_activity_at_chatwoot: toIso(conv.last_activity_at),
                    created_at_chatwoot: toIso(conv.created_at || conv.timestamp),
                    updated_at_chatwoot: toIso(conv.updated_at),
                    // Last message snapshot
                    last_non_activity_message_preview: lastMsg?.content || null,
                    last_message_at: toIso(lastMsg?.created_at),
                    updated_at: new Date().toISOString()
                };
            });

            const { error } = await supabase.schema('cw').from('conversations_current').upsert(rows, { onConflict: 'chatwoot_conversation_id' });
            if (error) console.error(`Error guardando conversaciones pag ${page}:`, error.message);
            else totalConvs += rows.length;

            // 3. INYECTAR MENSAJES
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
