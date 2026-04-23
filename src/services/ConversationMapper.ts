import { ChatwootConversation } from './ChatwootService';
import { MinifiedConversation } from './StorageService';

export const parseDateToUnix = (dateInput: any): number => {
    try {
        if (!dateInput) return 0;
        const numeric = Number(dateInput);
        if (!Number.isNaN(numeric)) {
            return numeric < 10000000000 ? Math.floor(numeric) : Math.floor(numeric / 1000);
        }

        const date = new Date(dateInput);
        return Number.isNaN(date.getTime()) ? 0 : Math.floor(date.getTime() / 1000);
    } catch {
        return 0;
    }
};

const compactObject = (obj: Record<string, any>) =>
    Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ''));

export const mapChatwootConversationToMinified = (conv: any): MinifiedConversation => ({
    id: conv.id,
    status: conv.status || 'open',
    labels: conv.labels || [],
    timestamp: parseDateToUnix(conv.timestamp || conv.last_activity_at || conv.updated_at || conv.created_at),
    created_at: parseDateToUnix(conv.created_at || conv.created_at_chatwoot || conv.timestamp),
    first_reply_created_at: parseDateToUnix(conv.first_reply_created_at),
    meta: {
        sender: {
            id: conv.meta?.sender?.id || conv.contact_id,
            name: conv.meta?.sender?.name,
            email: conv.meta?.sender?.email,
            phone_number: conv.meta?.sender?.phone_number,
            identifier: conv.meta?.sender?.identifier,
            custom_attributes: conv.meta?.sender?.custom_attributes || {},
            additional_attributes: conv.meta?.sender?.additional_attributes || conv.additional_attributes || {}
        },
        assignee: {
            name: conv.meta?.assignee?.name,
            email: conv.meta?.assignee?.email
        }
    },
    custom_attributes: conv.custom_attributes || {},
    messages: conv.messages,
    inbox_id: conv.inbox_id,
    last_non_activity_message: conv.last_non_activity_message,
    source: 'api'
});

export const mapSupabaseConversationRowToMinified = (row: any): MinifiedConversation => {
    const mappedAttrs = compactObject({
        nombre_completo: row.nombre_completo,
        fecha_visita: row.fecha_visita,
        hora_visita: row.hora_visita,
        agencia: row.agencia,
        celular: row.celular,
        correo: row.correo,
        campana: row.campana,
        ciudad: row.ciudad,
        edad: row.edad,
        canal: row.canal,
        agente: row.agente,
        score_interes: row.score_interes,
        monto_operacion: row.monto_operacion,
        fecha_monto_operacion: row.fecha_monto_operacion
    });

    const customAttributes = {
        ...(row.custom_attributes || {}),
        ...mappedAttrs
    };

    const meta = {
        ...(row.raw_payload?.meta || {}),
        ...(row.meta || {})
    };
    const sender = {
        ...(row.raw_payload?.meta?.sender || {}),
        ...(meta.sender || {})
    };
    const assignee = meta.assignee || {};

    const lastNonActivity = row.raw_payload?.last_non_activity_message || {};

    return {
        id: Number(row.chatwoot_conversation_id),
        status: row.status || 'open',
        labels: row.labels || [],
        timestamp: parseDateToUnix(
            row.last_activity_at_chatwoot ||
            row.last_message_at ||
            row.updated_at_chatwoot ||
            row.created_at_chatwoot
        ),
        created_at: parseDateToUnix(row.created_at_chatwoot),
        first_reply_created_at: parseDateToUnix(row.first_reply_created_at_chatwoot),
        meta: {
        sender: {
            id: sender.id || row.chatwoot_contact_id,
            name: sender.name || row.nombre_completo || 'Sin Nombre',
            email: sender.email || row.correo,
            phone_number: sender.phone_number || row.celular,
            identifier: sender.identifier,
            additional_attributes: sender.additional_attributes || row.raw_payload?.meta?.sender?.additional_attributes || {},
                custom_attributes: {
                    ...(sender.custom_attributes || {}),
                    ...customAttributes
                }
            },
            assignee: {
                name: assignee.name,
                email: assignee.email
            }
        },
        custom_attributes: customAttributes,
        messages: [],
        inbox_id: row.chatwoot_inbox_id ? Number(row.chatwoot_inbox_id) : undefined,
        last_non_activity_message: {
            ...lastNonActivity,
            content: row.last_non_activity_message_preview || lastNonActivity.content,
            created_at: parseDateToUnix(row.last_message_at || lastNonActivity.created_at)
        },
        source: 'supabase'
    };
};

export const mapMinifiedToChatwootConversation = (conv: MinifiedConversation): ChatwootConversation => ({
    id: conv.id,
    status: conv.status,
    inbox_id: conv.inbox_id || 0,
    messages: conv.messages || [],
    meta: {
        sender: {
            id: conv.meta?.sender?.id,
            name: conv.meta?.sender?.name || 'Sin Nombre',
            email: conv.meta?.sender?.email || '',
            phone_number: conv.meta?.sender?.phone_number || '',
            thumbnail: '',
            identifier: conv.meta?.sender?.identifier,
            custom_attributes: conv.meta?.sender?.custom_attributes || {},
            additional_attributes: conv.meta?.sender?.additional_attributes || {}
        },
        assignee: conv.meta?.assignee
    } as any,
    labels: conv.labels || [],
    last_non_activity_message: conv.last_non_activity_message || {
        content: conv.source === 'supabase' ? 'Historial de Supabase' : 'Ver historial',
        created_at: conv.timestamp
    },
    timestamp: conv.timestamp,
    created_at: conv.created_at,
    first_reply_created_at: conv.first_reply_created_at,
    custom_attributes: conv.custom_attributes || {}
});

export const mapSupabaseConversationRowToChatwoot = (row: any) =>
    mapMinifiedToChatwootConversation(mapSupabaseConversationRowToMinified(row));
