export interface MinifiedConversation {
    id: number;
    status: string;
    labels: string[];
    timestamp: number;
    created_at?: number;
    first_reply_created_at?: number;
    meta: {
        sender: {
            name: string;
            email?: string;
            phone_number: string;
            custom_attributes?: any;
        };
        assignee?: {
            name?: string;
            email?: string;
        };
    };
    custom_attributes?: {
        [key: string]: any;
    };
    messages?: any[];
    inbox_id?: number;
}

const DB_NAME = 'MonteMidasDB';
const STORE_NAME = 'conversations';
const DB_VERSION = 2;

export const StorageService = {
    initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => reject(event);
            request.onsuccess = (event: any) => resolve(event.target.result);
            request.onupgradeneeded = (event: any) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        });
    },

    async saveConversations(conversations: MinifiedConversation[]): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

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

            request.onsuccess = (event: any) => {
                // Return sorted by timestamp descending
                const data = event.target.result as MinifiedConversation[];
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
