import axios from 'axios';
import { config } from '../config';

// RECONNECTED - Chatwoot for the new project

const CHATWOOT_API_URL = config.chatwoot.baseUrl;
const API_TOKEN = config.chatwoot.apiToken;

export interface ChatwootConversation {
    id: number;
    status: string;
    inbox_id: number;
    messages: any[];
    meta: {
        sender: {
            name: string;
            email: string;
            phone_number: string;
            thumbnail: string;
            custom_attributes?: any;
        };
    };
    labels: string[];
    last_non_activity_message: {
        content: string;
        created_at: number;
    };
    timestamp: number;
    created_at?: number; // Unix timestamp when conversation was created
    first_reply_created_at?: number; // Unix timestamp of first agent reply
    waiting_since?: number; // Unix timestamp since waiting for response
    custom_attributes?: {
        [key: string]: any;
    };
}

export const chatwootService = {
    getConversations: async (params: {
        page?: number;
        status?: string;
        sort_by?: string;
        q?: string;
        since?: string;
        until?: string;
        labels?: string[];
        inbox_id?: string;
        signal?: AbortSignal;
    } = {}): Promise<{ payload: ChatwootConversation[]; meta: any }> => {
        try {
            // If 'q' is present, we perform a Contact Search first to find the specific person
            if (params.q) {
                console.log('Searching contacts for:', params.q);
                const contactsResponse = await axios.get(`${CHATWOOT_API_URL}/contacts/search`, {
                    headers: { api_access_token: API_TOKEN },
                    params: { q: params.q },
                    signal: params.signal
                });

                const contacts = contactsResponse.data.payload;
                console.log('Contacts found:', contacts.length);

                if (!contacts || contacts.length === 0) {
                    return { payload: [], meta: { count: 0, all_count: 0 } };
                }

                // Fetch conversations for each found contact
                const conversationPromises = contacts.map(async (contact: any) => {
                    try {
                        const convResponse = await axios.get(`${CHATWOOT_API_URL}/contacts/${contact.id}/conversations`, {
                            headers: { api_access_token: API_TOKEN },
                            signal: params.signal
                        });
                        return convResponse.data.payload;
                    } catch (err) {
                        console.error(`Error fetching conversations for contact ${contact.id}`, err);
                        return [];
                    }
                });

                const results = await Promise.all(conversationPromises);
                let allConversations = results.flat();

                // In-memory filter for labels if present
                if (params.labels && params.labels.length > 0) {
                    allConversations = allConversations.filter(conv =>
                        conv.labels && conv.labels.some((l: string) => params.labels!.includes(l))
                    );
                }

                return {
                    payload: allConversations,
                    meta: {
                        count: allConversations.length,
                        all_count: allConversations.length
                    }
                };
            }

            // Normal flow (no search query)
            const response = await axios.get(`${CHATWOOT_API_URL}/conversations`, {
                headers: {
                    api_access_token: API_TOKEN,
                },
                params: {
                    page: params.page || 1,
                    status: params.status || 'all',
                    assignee_type: 'all', // ENSURE WE SEE EVERYTHING, NOT JUST "MINE"
                    sort_by: params.sort_by || 'last_activity_at_desc',
                    since: params.since,
                    until: params.until,
                    labels: params.labels ? params.labels.join(',') : undefined,
                    inbox_id: params.inbox_id,
                },
                signal: params.signal
            });

            console.debug(`[ChatwootService] GET /conversations - Status: ${response.status}`, {
                params: { page: params.page, status: params.status, assignee_type: 'all' },
                received: Array.isArray(response.data) ? response.data.length : 'object'
            });
            // Chatwoot Cloud API (app.chatwoot.com) often wraps results in an extra 'data' key
            // Path: res.data.data.payload (when using Axios)
            const rawBody = response.data.data || response.data;

            const convs = Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
            const meta = rawBody.meta || {
                all_count: convs.length,
                total_count: convs.length
            };

            console.debug(`[ChatwootService] Data Processed:`, {
                hasDataKey: !!response.data.data,
                convCount: convs.length
            });

            return {
                payload: convs,
                meta: meta
            };
        } catch (error) {
            console.error('Error fetching Chatwoot conversations:', error);
            throw error;
        }
    },

    getLabels: async (params?: { signal?: AbortSignal }): Promise<string[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/labels`, {
                headers: {
                    api_access_token: API_TOKEN,
                },
                signal: params?.signal
            });
            return response.data.payload.map((label: any) => label.title);
        } catch (error) {
            console.error('Error fetching Chatwoot labels:', error);
            return [];
        }
    },

    getInboxes: async (params?: { signal?: AbortSignal }): Promise<any[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/inboxes`, {
                headers: {
                    api_access_token: API_TOKEN,
                },
                signal: params?.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
        } catch (error) {
            console.error('Error fetching Chatwoot inboxes:', error);
            return [];
        }
    },

    getContacts: async (params: { page?: number; signal?: AbortSignal } = {}): Promise<any[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/contacts`, {
                headers: { api_access_token: API_TOKEN },
                params: { page: params.page || 1 },
                signal: params.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
        } catch (error) {
            console.error('Error fetching Chatwoot contacts:', error);
            return [];
        }
    },

    getMessages: async (conversationId: number, params?: { signal?: AbortSignal }): Promise<any[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/conversations/${conversationId}/messages`, {
                headers: { api_access_token: API_TOKEN },
                signal: params?.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
        } catch (error) {
            console.error(`Error fetching messages for conversation ${conversationId}:`, error);
            return [];
        }
    },

    getConversationDetails: async (conversationId: number, params?: { signal?: AbortSignal }): Promise<any> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/conversations/${conversationId}`, {
                headers: { api_access_token: API_TOKEN },
                signal: params?.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
        } catch (error) {
            console.error(`Error fetching conversation details for ${conversationId}:`, error);
            return null;
        }
    },

    getAttributeDefinitions: async (params?: { signal?: AbortSignal }): Promise<any[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/custom_attribute_definitions`, {
                headers: { api_access_token: API_TOKEN },
                signal: params?.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
        } catch (error) {
            console.error('Error fetching Chatwoot attribute definitions:', error);
            return [];
        }
    },

    getReportingEvents: async (params: { since: string; until: string; page?: number; signal?: AbortSignal }): Promise<any[]> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/reporting_events`, {
                headers: { api_access_token: API_TOKEN },
                params: {
                    since: params.since,
                    until: params.until,
                    page: params.page || 1
                },
                signal: params.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
        } catch (error) {
            console.error('Error fetching Chatwoot reporting events:', error);
            return [];
        }
    },

    getAccountReports: async (params: { metric: string; since: string; until: string; signal?: AbortSignal }): Promise<any> => {
        try {
            const response = await axios.get(`${CHATWOOT_API_URL}/reports/summary`, {
                headers: { api_access_token: API_TOKEN },
                params: {
                    since: params.since,
                    until: params.until
                },
                signal: params.signal
            });
            const rawBody = response.data.data || response.data;
            return Array.isArray(rawBody) ? rawBody : (rawBody.payload || rawBody);
        } catch (error) {
            console.error('Error fetching Chatwoot account reports:', error);
            return null;
        }
    }
};
