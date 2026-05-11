import axios from "axios";
import { config } from "../../config";
import type { ChatwootConversation } from "../../domain/conversation";
import type { UnknownRecord } from "../../domain/common/types";
import { asRecord } from "../../domain/common/types";
import type { ConversationMessage, Inbox } from "../../domain/lead";

const CHATWOOT_API_URL = config.chatwoot.baseUrl;
const API_TOKEN = config.chatwoot.apiToken;

export interface ChatwootRequestOptions {
    signal?: AbortSignal;
}

export interface ChatwootConversationFilters extends ChatwootRequestOptions {
    page?: number;
    status?: string;
    sort_by?: string;
    q?: string;
    since?: string;
    until?: string;
    labels?: string[];
    inbox_id?: string;
}

export interface ChatwootListResponse<TItem> {
    payload: TItem[];
    meta: UnknownRecord;
}

export interface ChatwootReportingEventFilters extends ChatwootRequestOptions {
    since: string;
    until: string;
    page?: number;
}

export interface ChatwootAccountReportFilters extends ChatwootRequestOptions {
    metric: string;
    since: string;
    until: string;
}

const authHeaders = () => ({ api_access_token: API_TOKEN });

const unwrapBody = (body: unknown) => {
    const record = asRecord(body);
    return record.data ?? body;
};

const readPayloadArray = (body: unknown): UnknownRecord[] => {
    const rawBody = unwrapBody(body);
    if (Array.isArray(rawBody)) return rawBody.filter((item): item is UnknownRecord => typeof item === "object" && item !== null && !Array.isArray(item));

    const record = asRecord(rawBody);
    const payload = record.payload;
    return Array.isArray(payload)
        ? payload.filter((item): item is UnknownRecord => typeof item === "object" && item !== null && !Array.isArray(item))
        : [];
};

const readMeta = (body: unknown, fallbackCount: number): UnknownRecord => {
    const rawBody = unwrapBody(body);
    const record = asRecord(rawBody);
    const meta = asRecord(record.meta);
    return Object.keys(meta).length > 0
        ? meta
        : { all_count: fallbackCount, total_count: fallbackCount };
};

const readPayloadOrBody = (body: unknown) => {
    const rawBody = unwrapBody(body);
    if (Array.isArray(rawBody)) return rawBody;

    const record = asRecord(rawBody);
    return record.payload ?? rawBody;
};

const toConversationArray = (items: UnknownRecord[]): ChatwootConversation[] =>
    items.map((item) => item as unknown as ChatwootConversation);

const toInboxArray = (items: UnknownRecord[]): Inbox[] =>
    items
        .map((item) => ({
            ...item,
            id: Number(item.id),
        }) as Inbox)
        .filter((inbox) => Number.isFinite(inbox.id));

const toMessageArray = (items: UnknownRecord[]): ConversationMessage[] =>
    items.map((item) => item as ConversationMessage);

export const chatwootClient = {
    async getConversations(params: ChatwootConversationFilters = {}): Promise<ChatwootListResponse<ChatwootConversation>> {
        try {
            if (params.q) {
                const contactsResponse = await axios.get<unknown>(`${CHATWOOT_API_URL}/contacts/search`, {
                    headers: authHeaders(),
                    params: { q: params.q },
                    signal: params.signal,
                });
                const contacts = readPayloadArray(contactsResponse.data);

                if (contacts.length === 0) {
                    return { payload: [], meta: { count: 0, all_count: 0 } };
                }

                const conversationResults = await Promise.all(contacts.map(async (contact) => {
                    try {
                        const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/contacts/${contact.id}/conversations`, {
                            headers: authHeaders(),
                            signal: params.signal,
                        });
                        return readPayloadArray(response.data);
                    } catch (error) {
                        console.error(`Error fetching conversations for contact ${String(contact.id)}`, error);
                        return [];
                    }
                }));

                let conversations = conversationResults.flat();
                if (params.labels && params.labels.length > 0) {
                    conversations = conversations.filter((conversation) => {
                        const labels = Array.isArray(conversation.labels) ? conversation.labels.map(String) : [];
                        return labels.some((label) => params.labels?.includes(label));
                    });
                }

                return {
                    payload: toConversationArray(conversations),
                    meta: {
                        count: conversations.length,
                        all_count: conversations.length,
                    },
                };
            }

            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/conversations`, {
                headers: authHeaders(),
                params: {
                    page: params.page || 1,
                    status: params.status || "all",
                    assignee_type: "all",
                    sort_by: params.sort_by || "last_activity_at_desc",
                    since: params.since,
                    until: params.until,
                    labels: params.labels ? params.labels.join(",") : undefined,
                    inbox_id: params.inbox_id,
                },
                signal: params.signal,
            });

            const conversations = readPayloadArray(response.data);
            return {
                payload: toConversationArray(conversations),
                meta: readMeta(response.data, conversations.length),
            };
        } catch (error) {
            console.error("Error fetching Chatwoot conversations:", error);
            throw error;
        }
    },

    async getLabels(params?: ChatwootRequestOptions): Promise<string[]> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/labels`, {
                headers: authHeaders(),
                signal: params?.signal,
            });
            return readPayloadArray(response.data)
                .map((label) => String(label.title || "").trim())
                .filter(Boolean);
        } catch (error) {
            console.error("Error fetching Chatwoot labels:", error);
            return [];
        }
    },

    async getInboxes(params?: ChatwootRequestOptions): Promise<Inbox[]> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/inboxes`, {
                headers: authHeaders(),
                signal: params?.signal,
            });
            return toInboxArray(readPayloadArray(response.data));
        } catch (error) {
            console.error("Error fetching Chatwoot inboxes:", error);
            return [];
        }
    },

    async getContacts(params: { page?: number; signal?: AbortSignal } = {}): Promise<UnknownRecord[]> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/contacts`, {
                headers: authHeaders(),
                params: { page: params.page || 1 },
                signal: params.signal,
            });
            return readPayloadArray(response.data);
        } catch (error) {
            console.error("Error fetching Chatwoot contacts:", error);
            return [];
        }
    },

    async getMessages(conversationId: number, params?: ChatwootRequestOptions): Promise<ConversationMessage[]> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/conversations/${conversationId}/messages`, {
                headers: authHeaders(),
                signal: params?.signal,
            });
            return toMessageArray(readPayloadArray(response.data));
        } catch (error) {
            console.error(`Error fetching messages for conversation ${conversationId}:`, error);
            return [];
        }
    },

    async getConversationDetails(conversationId: number, params?: ChatwootRequestOptions): Promise<unknown | null> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/conversations/${conversationId}`, {
                headers: authHeaders(),
                signal: params?.signal,
            });
            return readPayloadOrBody(response.data);
        } catch (error) {
            console.error(`Error fetching conversation details for ${conversationId}:`, error);
            return null;
        }
    },

    async getAttributeDefinitions(params?: ChatwootRequestOptions): Promise<UnknownRecord[]> {
        const requestVariants: Array<UnknownRecord | undefined> = [
            undefined,
            { attribute_model: 1 },
            { attribute_model: "contact" },
            { attribute_scope: "contact" },
        ];
        const byKey = new Map<string, UnknownRecord>();

        try {
            const results = await Promise.allSettled(
                requestVariants.map((requestParams) =>
                    axios.get<unknown>(`${CHATWOOT_API_URL}/custom_attribute_definitions`, {
                        headers: authHeaders(),
                        params: requestParams,
                        signal: params?.signal,
                    }),
                ),
            );

            results.forEach((result) => {
                if (result.status !== "fulfilled") return;

                readPayloadArray(result.value.data).forEach((definition) => {
                    const key = String(definition.attribute_key || definition.key || definition.id || "").trim();
                    if (!key) return;

                    byKey.set(key, {
                        ...(byKey.get(key) || {}),
                        ...definition,
                    });
                });
            });

            return Array.from(byKey.values());
        } catch (error) {
            console.error("Error fetching Chatwoot attribute definitions:", error);
            return [];
        }
    },

    async getReportingEvents(params: ChatwootReportingEventFilters): Promise<UnknownRecord[]> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/reporting_events`, {
                headers: authHeaders(),
                params: {
                    since: params.since,
                    until: params.until,
                    page: params.page || 1,
                },
                signal: params.signal,
            });
            return readPayloadArray(response.data);
        } catch (error) {
            console.error("Error fetching Chatwoot reporting events:", error);
            return [];
        }
    },

    async getAccountReports(params: ChatwootAccountReportFilters): Promise<unknown | null> {
        try {
            const response = await axios.get<unknown>(`${CHATWOOT_API_URL}/reports/summary`, {
                headers: authHeaders(),
                params: {
                    since: params.since,
                    until: params.until,
                },
                signal: params.signal,
            });
            return readPayloadOrBody(response.data);
        } catch (error) {
            console.error("Error fetching Chatwoot account reports:", error);
            return null;
        }
    },

    async updateConversationLabels(conversationId: number, labels: string[]): Promise<unknown> {
        try {
            const response = await axios.post<unknown>(`${CHATWOOT_API_URL}/conversations/${conversationId}/labels`, {
                labels,
            }, {
                headers: authHeaders(),
            });
            return response.data;
        } catch (error) {
            console.error(`Error updating labels for conversation ${conversationId}:`, error);
            throw error;
        }
    },

    async updateConversationCustomAttributes(
        conversationId: number,
        customAttributes: UnknownRecord,
    ): Promise<unknown> {
        try {
            const response = await axios.post<unknown>(`${CHATWOOT_API_URL}/conversations/${conversationId}/custom_attributes`, {
                custom_attributes: customAttributes,
            }, {
                headers: authHeaders(),
            });
            return response.data;
        } catch (error) {
            console.error(`Error updating custom attributes for conversation ${conversationId}:`, error);
            throw error;
        }
    },

    async updateContact(contactId: number, data: UnknownRecord): Promise<unknown> {
        try {
            const response = await axios.put<unknown>(`${CHATWOOT_API_URL}/contacts/${contactId}`, data, {
                headers: authHeaders(),
            });
            return response.data;
        } catch (error) {
            console.error(`Error updating contact ${contactId}:`, error);
            throw error;
        }
    },
};
