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
    const { data: runs, error: runError } = await supabase
        .schema('cw')
        .from('sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5);

    if (runError) {
        console.error('Error fetching sync_runs:', runError);
    } else {
        console.log('Last 5 sync runs:');
        runs.forEach(r => {
            console.log(`[${r.id}] ${r.sync_type} - ${r.status} : ${r.error_message || 'No error'}`);
        });
    }

    const { count, error: err } = await supabase.schema('cw').from('conversations_current').select('*', { count: 'exact', head: true });
    console.log('Conversations in DB:', count, err || '');
})();
