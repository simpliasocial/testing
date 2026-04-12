// NEW PROJECT CONFIGURATION
// Updated with the new project credentials

export const config = {
    supabase: {
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
    },
    chatwoot: {
        baseUrl: `/chatwoot-api/api/v1/accounts/${import.meta.env.VITE_CHATWOOT_ACCOUNT_ID}`,
        apiToken: import.meta.env.VITE_CHATWOOT_API_TOKEN,
        publicUrl: import.meta.env.VITE_CHATWOOT_BASE_URL,
        accountId: import.meta.env.VITE_CHATWOOT_ACCOUNT_ID
    }
};
