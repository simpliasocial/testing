import type { MinifiedConversation } from "@/domain/conversation";

export type { MinifiedConversation } from "@/domain/conversation";

const DB_NAME = 'MonteMidasDB';
const STORE_NAME = 'conversations';
const DB_VERSION = 3;

export const StorageService = {
    initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => reject(event);
            request.onsuccess = (event) => resolve((event.target as IDBOpenDBRequest).result);
            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                // Force delete and recreate to fix broken schemas from previous versions
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    db.deleteObjectStore(STORE_NAME);
                }
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            };
        });
    },

    async saveConversations(conversations: MinifiedConversation[], options: { replaceAll?: boolean } = {}): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            if (options.replaceAll) {
                store.clear();
            }

            conversations.forEach((conv) => {
                store.put(conv); // Overwrite if it exists, add if new
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = (event) => reject(event);
        });
    },

    async loadConversations(): Promise<MinifiedConversation[]> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = (event) => {
                // Return sorted by timestamp descending
                const data = (event.target as IDBRequest<MinifiedConversation[]>).result;
                resolve(data.sort((a, b) => b.timestamp - a.timestamp));
            };
            request.onerror = (event) => reject(event);
        });
    },

    async clearConversations(): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event);
        });
    }
};
