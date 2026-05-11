import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const {
    mapChatwootConversationToMinified,
    mapMinifiedToChatwootConversation,
    mapSupabaseConversationRowToMinified,
} = jiti("../../src/infrastructure/conversation/ConversationMapper.ts");

const test = (name, fn) => {
    try {
        fn();
        console.log(`ok - ${name}`);
    } catch (error) {
        console.error(`not ok - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

test("mapChatwootConversationToMinified normalizes live API payloads", () => {
    const mapped = mapChatwootConversationToMinified({
        id: "42",
        status: "open",
        labels: ["venta_exitosa", "instagram"],
        updated_at: "2026-05-07T15:00:00.000Z",
        created_at: "2026-05-06T10:00:00.000Z",
        first_reply_created_at: "2026-05-06T10:05:00.000Z",
        inbox_id: "12",
        contact_id: "99",
        meta: {
            sender: {
                name: "Ana",
                email: "ana@example.com",
                phone_number: "+593999",
                custom_attributes: { ciudad: "Quito" },
            },
            assignee: { name: "Asesor", email: "asesor@example.com" },
        },
        custom_attributes: { campana: "Mayo" },
        messages: [{ content: "Hola", message_type: 0 }],
    });

    assert.equal(mapped.id, 42);
    assert.equal(mapped.inbox_id, 12);
    assert.equal(mapped.meta.sender.id, 99);
    assert.equal(mapped.meta.sender.name, "Ana");
    assert.deepEqual(mapped.labels, ["venta_exitosa", "instagram"]);
    assert.equal(mapped.contact_custom_attributes.ciudad, "Quito");
    assert.equal(mapped.conversation_custom_attributes.campana, "Mayo");
    assert.equal(mapped.source, "api");
    assert.equal(mapped.timestamp, Math.floor(Date.parse("2026-05-07T15:00:00.000Z") / 1000));
});

test("mapSupabaseConversationRowToMinified merges stored attrs and preserves history preview", () => {
    const mapped = mapSupabaseConversationRowToMinified({
        chatwoot_conversation_id: "77",
        chatwoot_contact_id: "88",
        chatwoot_inbox_id: "5",
        status: "resolved",
        labels: ["cita_agendada"],
        nombre_completo: "Luis",
        celular: "0999",
        correo: "luis@example.com",
        campana: "Retargeting",
        score_interes: 81,
        created_at_chatwoot: "2026-05-01T12:00:00.000Z",
        last_message_at: "2026-05-07T12:00:00.000Z",
        contact_custom_attributes: { ciudad: "Guayaquil" },
        conversation_custom_attributes: { agencia: "Centro" },
        raw_payload: {
            meta: {
                assignee: { name: "Maria" },
            },
            last_non_activity_message: {
                content: "Mensaje original",
                message_direction: "incoming",
            },
        },
        last_non_activity_message_preview: "Preview guardado",
    });

    assert.equal(mapped.id, 77);
    assert.equal(mapped.meta.sender.id, 88);
    assert.equal(mapped.meta.sender.name, "Luis");
    assert.equal(mapped.meta.assignee.name, "Maria");
    assert.equal(mapped.custom_attributes.campana, "Retargeting");
    assert.equal(mapped.custom_attributes.ciudad, "Guayaquil");
    assert.equal(mapped.custom_attributes.agencia, "Centro");
    assert.equal(mapped.last_non_activity_message.content, "Preview guardado");
    assert.equal(mapped.source, "supabase");
});

test("mapMinifiedToChatwootConversation keeps UI-compatible fallback fields", () => {
    const mapped = mapMinifiedToChatwootConversation({
        id: 101,
        status: "open",
        labels: [],
        timestamp: 1778400000,
        meta: {
            sender: {
                name: "Sin Nombre",
                phone_number: "",
                custom_attributes: { ciudad: "Quito" },
            },
        },
        source: "supabase",
    });

    assert.equal(mapped.id, 101);
    assert.equal(mapped.inbox_id, 0);
    assert.equal(mapped.last_non_activity_message.content, "Historial de Supabase");
    assert.equal(mapped.meta.sender.thumbnail, "");
    assert.equal(mapped.contact_custom_attributes.ciudad, "Quito");
});
