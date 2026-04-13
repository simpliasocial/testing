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

const url = `${env.VITE_CHATWOOT_BASE_URL}/api/v1/accounts/${env.VITE_CHATWOOT_ACCOUNT_ID}/conversations`;

(async () => {
    console.log('Fetching from:', url);
    try {
        const res = await axios.get(url, {
            headers: { api_access_token: env.VITE_CHATWOOT_API_TOKEN },
            params: { assignee_type: 'all' }
        });
        const rawBody = res.data.data || res.data;
        const payload = Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);
        console.log(`Payload length:`, payload.length);
        if (payload.length > 0) {
            console.log(`First conv ID:`, payload[0].id);
            console.log(`Status:`, payload[0].status);
        } else {
            console.log(`Raw keys:`, Object.keys(res.data));
            console.log(`Response meta:`, JSON.stringify(res.data.meta || res.data.data?.meta));
        }
    } catch (err) {
        console.error(err.response ? JSON.stringify(err.response.data) : err.message);
    }
})();
