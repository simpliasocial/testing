const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const url = `${process.env.VITE_CHATWOOT_BASE_URL}/api/v1/accounts/${process.env.VITE_CHATWOOT_ACCOUNT_ID}/conversations`;

(async () => {
    console.log('Fetching from:', url);
    try {
        const res = await axios.get(url, {
            headers: { api_access_token: process.env.VITE_CHATWOOT_API_TOKEN },
            params: { assignee_type: 'all' }
        });
        console.log("Keys in response.data:", Object.keys(res.data));
        console.log("Keys in response.data.data:", res.data.data ? Object.keys(res.data.data) : "No data key");

        const rawBody = res.data.data || res.data;
        const meta = rawBody.meta;
        const payload = Array.isArray(rawBody) ? rawBody : (rawBody.payload || []);

        console.log(`Meta:`, meta);
        console.log(`Payload length:`, payload.length);
        if (payload.length > 0) {
            console.log(`First conv ID:`, payload[0].id);
            console.log(`First conv snippet:`, JSON.stringify(payload[0]).substring(0, 200));
        } else {
            console.log(`Raw response length/keys:`, JSON.stringify(res.data).substring(0, 300));
        }
    } catch (err) {
        console.error(err.response ? JSON.stringify(err.response.data).substring(0, 200) : err.message);
    }
})();
