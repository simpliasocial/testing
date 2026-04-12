import { chatwootService } from './ChatwootService';
import { SupabaseSyncService } from './SupabaseSyncService';

export const SyncService = {
    async bootstrap() {
        console.log('🚀 [Sync] Starting FULL Bootstrap Sync...');
        const runId = await SupabaseSyncService.startSyncRun('bootstrap');
        const stats = { inboxes: 0, teams: 0, attributes: 0, contacts: 0, conversations: 0, messages: 0 };

        try {
            // 1. Catalogs
            console.log('📦 [Sync] Fetching Catalogs (Inboxes/Attributes)...');
            const inboxes = await chatwootService.getInboxes();
            await SupabaseSyncService.upsertInboxes(inboxes);
            stats.inboxes = inboxes.length;
            console.log(`✅ [Sync] Inboxes synced: ${stats.inboxes}`);

            const attrDefs = await chatwootService.getAttributeDefinitions();
            if (Array.isArray(attrDefs)) {
                await SupabaseSyncService.upsertAttributeDefinitions(attrDefs);
                stats.attributes = attrDefs.length;
                console.log(`✅ [Sync] Attributes synced: ${stats.attributes}`);
            }

            // 2. Contacts (Paginated)
            console.log('👤 [Sync] Fetching Contacts...');
            let contactPage = 1;
            let hasMoreContacts = true;
            while (hasMoreContacts) {
                console.log(`⏳ [Sync] Fetching Contacts Page ${contactPage}...`);
                const contacts = await chatwootService.getContacts({ page: contactPage });
                if (contacts && contacts.length > 0) {
                    await SupabaseSyncService.upsertContacts(contacts);
                    stats.contacts += contacts.length;
                    console.log(`✅ [Sync] Contacts cumulative: ${stats.contacts}`);
                    contactPage++;
                } else {
                    hasMoreContacts = false;
                }
            }

            // 3. Conversations (Paginated)
            console.log('💬 [Sync] Fetching Conversations...');
            let convPage = 1;
            let hasMoreConvs = true;
            while (hasMoreConvs) {
                console.log(`⏳ [Sync] Fetching Conversations Page ${convPage}...`);
                const response = await chatwootService.getConversations({ page: convPage });
                const convs = response.payload || [];

                if (convs.length > 0) {
                    console.log(`✅ [Sync] Processing ${convs.length} conversations from page ${convPage}`);
                    await SupabaseSyncService.upsertConversations(convs);
                    stats.conversations += convs.length;

                    // Sync messages for each conversation during bootstrap
                    for (const conv of convs) {
                        const messages = await chatwootService.getMessages(conv.id);
                        if (messages.length > 0) {
                            await SupabaseSyncService.upsertMessages(messages);
                            stats.messages += messages.length;
                        }
                    }
                    console.log(`✅ [Sync] Cumulative: ${stats.conversations} convs, ${stats.messages} msgs`);
                    convPage++;
                } else {
                    hasMoreConvs = false;
                }

                if (convPage % 5 === 0) await new Promise(r => setTimeout(r, 1000));
            }

            await SupabaseSyncService.endSyncRun(runId, 'success', stats);
            console.log('🏁 [Sync] FULL Bootstrap Sync FINISHED!', stats);
        } catch (err: any) {
            console.error('❌ [Sync] Bootstrap Sync FAILED:', err);
            await SupabaseSyncService.endSyncRun(runId, 'error', stats, err.message);
            throw err;
        }
    },

    async runDailySync() {
        console.log('Starting Daily Delta Sync...');
        const runId = await SupabaseSyncService.startSyncRun('daily_delta');
        const cursor = await SupabaseSyncService.getSyncCursor('daily_delta');

        const now = new Date();
        const until = now.toISOString();
        // Fallback to 24 hours ago if no cursor
        const since = cursor?.last_until_ts || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const stats = { events: 0, refreshedConversations: 0, messages: 0 };

        try {
            // 1. Fetch reporting events to find activity
            console.log(`Fetching events from ${since} to ${until}`);
            const events = await chatwootService.getReportingEvents({ since, until });
            stats.events = events.length;

            if (events.length > 0) {
                await SupabaseSyncService.upsertReportingEvents(events);

                // 2. Extract affected conversations
                const affectedConvIds = Array.from(new Set(events.map((e: any) => e.conversation_id).filter(Boolean)));
                console.log(`Refreshing ${affectedConvIds.length} affected conversations`);

                for (const convId of affectedConvIds as number[]) {
                    // Fetch full conversation details
                    const convData = await chatwootService.getConversationDetails(convId);
                    if (convData) {
                        await SupabaseSyncService.upsertConversations([convData]);
                    }

                    // Fetch messages
                    const messages = await chatwootService.getMessages(convId);
                    if (messages.length > 0) {
                        await SupabaseSyncService.upsertMessages(messages);
                        stats.messages += messages.length;
                    }
                    stats.refreshedConversations++;
                }
            }

            // 3. Always refresh catalogs
            const inboxes = await chatwootService.getInboxes();
            await SupabaseSyncService.upsertInboxes(inboxes);

            await SupabaseSyncService.updateSyncCursor('daily_delta', since, until);
            await SupabaseSyncService.endSyncRun(runId, 'success', stats);
            console.log('Daily sync finished!', stats);
        } catch (err: any) {
            console.error('Daily sync failed:', err);
            await SupabaseSyncService.endSyncRun(runId, 'error', stats, err.message);
        }
    }
};
