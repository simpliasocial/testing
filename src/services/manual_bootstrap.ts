import { SyncService } from './SyncService';
import { config } from '../config';

async function run() {
    console.log("--- MANUAL BOOTSTRAP START ---");
    console.log("Using Chatwoot Account ID:", config.chatwoot?.accountId);
    try {
        await SyncService.bootstrap();
        console.log("--- MANUAL BOOTSTRAP SUCCESS ---");
    } catch (err) {
        console.error("--- MANUAL BOOTSTRAP FAILED ---", err);
    }
}

run();
