
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Manejo de CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? "",
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""
        );

        const CHATWOOT_BASE = Deno.env.get('VITE_CHATWOOT_BASE_URL');
        const ACCOUNT_ID = Deno.env.get('VITE_CHATWOOT_ACCOUNT_ID');
        const API_TOKEN = Deno.env.get('VITE_CHATWOOT_API_TOKEN');
        const CHATWOOT_URL = `${CHATWOOT_BASE}/api/v1/accounts/${ACCOUNT_ID}`;

        console.log("🚀 Iniciando Sincronización Profesional...");

        async function apiGet(endpoint: string, params: any = {}) {
            const url = new URL(`${CHATWOOT_URL}${endpoint}`);
            Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

            const res = await fetch(url.toString(), {
                headers: { 'api_access_token': API_TOKEN || '' }
            });
            const data = await res.json();
            const payload = data.data || data;
            return Array.isArray(payload) ? payload : (payload.payload || payload);
        }

        // 1. Sincronizar Inboxes
        console.log("📦 Ingestando Inboxes...");
        const inboxes = await apiGet('/inboxes');
        if (inboxes.length > 0) {
            await supabase.schema('cw').from('inboxes').upsert(inboxes.map((i: any) => ({
                chatwoot_inbox_id: i.id,
                name: i.name,
                channel_type: i.channel_type,
                updated_at: new Date().toISOString()
            })));
        }

        // 2. Sincronizar Conversaciones (Paginación profunda)
        console.log("💬 Ingestando Conversaciones...");
        let page = 1;
        let totalC = 0;
        while (true) {
            const convs = await apiGet('/conversations', { page, status: 'all' });
            if (!convs || convs.length === 0) break;

            // Extraer contactos primero
            const contacts = convs.filter((c: any) => c.meta?.sender).map((c: any) => ({
                chatwoot_contact_id: c.meta.sender.id,
                name: c.meta.sender.name,
                email: c.meta.sender.email,
                phone_number: c.meta.sender.phone_number,
                created_at_chatwoot: c.meta.sender.created_at ? new Date(c.meta.sender.created_at * 1000).toISOString() : null,
                updated_at: new Date().toISOString()
            }));

            if (contacts.length > 0) {
                await supabase.schema('cw').from('contacts_current').upsert(contacts);
            }

            // Datos de negocio
            const rows = convs.map((c: any) => {
                const attrs = { ...(c.meta?.sender?.custom_attributes || {}), ...(c.custom_attributes || {}) };
                return {
                    chatwoot_conversation_id: c.id,
                    chatwoot_contact_id: c.meta?.sender?.id || c.contact_id,
                    chatwoot_account_id: c.account_id,
                    chatwoot_inbox_id: c.inbox_id,
                    assignee_id: c.assignee_id,
                    status: c.status,
                    labels: c.labels || [],
                    nombre_completo: attrs.nombre_completo,
                    agencia: attrs.agencia,
                    canal: attrs.canal,
                    monto_operacion: parseFloat(attrs.monto_operacion) || 0,
                    first_reply_created_at: c.first_reply_created_at ? new Date(c.first_reply_created_at * 1000).toISOString() : null,
                    waiting_since: c.waiting_since ? new Date(c.waiting_since * 1000).toISOString() : null,
                    created_at_chatwoot: c.timestamp ? new Date(c.timestamp * 1000).toISOString() : null,
                    updated_at: new Date().toISOString()
                }
            });

            await supabase.schema('cw').from('conversations_current').upsert(rows);
            totalC += rows.length;
            page++;
            if (page > 10) break; // Límite de seguridad
        }

        return new Response(JSON.stringify({
            success: true,
            conversations_synced: totalC,
            timestamp: new Date().toISOString()
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
