const axios = require('axios');
const fs = require('fs');

const envFile = fs.readFileSync('.env', 'utf8');
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

(async () => {
    const url = `${env.VITE_CHATWOOT_BASE_URL}/api/v1/accounts/${env.VITE_CHATWOOT_ACCOUNT_ID}/conversations`;
    const res = await axios.get(url, {
        headers: { api_access_token: env.VITE_CHATWOOT_API_TOKEN },
        params: { assignee_type: 'all' }
    });

    const rawBody = res.data.data || res.data;
    const convs = Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);

    convs.forEach(c => {
        console.log(`Conv ID: ${c.id}`);
        console.log(`- Contact ID: ${c.contact_id}`);
        console.log(`- Sender ID in Meta:`, c.meta?.sender?.id);
    });
})();
