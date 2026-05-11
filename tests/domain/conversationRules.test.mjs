import assert from "node:assert/strict";
import createJiti from "jiti";

const jiti = createJiti(import.meta.url);
const { uniqueConversationsById } = jiti("../../src/domain/conversation/index.ts");
const {
    isIncomingCustomerMessage,
    isPublicMessage,
    mapIncomingMessageEvent,
    messageTimestamp,
    uniqueIncomingEvents,
} = jiti("../../src/shared/conversation/messageTraffic.ts");

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

test("uniqueConversationsById keeps latest API conversation by id and sorts by activity", () => {
    const rows = uniqueConversationsById([
        { id: 1, timestamp: 100, status: "open", labels: [], meta: { sender: {} } },
        { id: 2, timestamp: 300, status: "open", labels: [], meta: { sender: {} } },
        { id: 1, timestamp: 200, status: "resolved", labels: ["sale"], meta: { sender: {} } },
    ]);

    assert.deepEqual(rows.map((row) => row.id), [2, 1]);
    assert.equal(rows[1].status, "resolved");
});

test("message traffic helpers normalize public incoming messages", () => {
    const message = {
        chatwoot_message_id: 10,
        chatwoot_conversation_id: 20,
        chatwoot_inbox_id: 30,
        created_at_chatwoot: "2026-05-07T15:00:00.000Z",
        message_direction: "incoming",
        is_private: false,
    };

    assert.equal(isIncomingCustomerMessage(message), true);
    assert.equal(isPublicMessage(message), true);
    assert.equal(messageTimestamp(message), 1778166000);

    const event = mapIncomingMessageEvent(message, "supabase");
    assert.equal(event.id, "10");
    assert.equal(event.conversationId, 20);
    assert.equal(event.inboxId, 30);
    assert.equal(event.source, "supabase");
});

test("uniqueIncomingEvents deduplicates by stable event id", () => {
    const events = uniqueIncomingEvents([
        { id: "b", conversationId: 2, createdAtIso: "2026-05-07T15:00:01.000Z", createdAtUnix: 2, date: "2026-05-07", hour: 10, hourLabel: "10:00", source: "api" },
        { id: "a", conversationId: 1, createdAtIso: "2026-05-07T15:00:00.000Z", createdAtUnix: 1, date: "2026-05-07", hour: 10, hourLabel: "10:00", source: "supabase" },
        { id: "b", conversationId: 2, createdAtIso: "2026-05-07T15:00:01.000Z", createdAtUnix: 2, date: "2026-05-07", hour: 10, hourLabel: "10:00", source: "api" },
    ]);

    assert.deepEqual(events.map((event) => event.id), ["a", "b"]);
});
