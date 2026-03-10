// CONFIGURACIÓN DEL NUEVO PROYECTO
// Actualizado con las credenciales del nuevo proyecto

export const config = {
    supabase: {
        url: import.meta.env.VITE_SUPABASE_URL,
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY
    },
    chatwoot: {
        baseUrl: "/chatwoot-api/api/v1/accounts/1",
        apiToken: import.meta.env.VITE_CHATWOOT_API_TOKEN,
        publicUrl: import.meta.env.VITE_CHATWOOT_BASE_URL
    }
};
