const { createClient } = require('@supabase/supabase-js');
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

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

(async () => {
    const testContact = {
        chatwoot_contact_id: 788928356,
        name: 'Test Debug Contact',
        updated_at: new Date().toISOString()
    };

    // Test direct upsert to contacts_current
    const { error, data } = await supabase.schema('cw').from('contacts_current').upsert([testContact], { onConflict: 'chatwoot_contact_id' }).select();
    if (error) {
        console.error('Failed to insert test contact:', error);
    } else {
        console.log('Successfully inserted test contact:', data);
    }
})();
