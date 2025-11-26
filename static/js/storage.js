/**
 * Client-Side Storage Module using IndexedDB
 * 
 * Privacy Features:
 * - All messages stored locally in browser
 * - Call logs stored locally (never synced to server)
 * - Read receipts stored locally
 * - Auto-cleanup on logout
 */

class LocalStorage {
    constructor() {
        this.db = null;
        this.dbName = 'BijMijPrivateDB';
        this.dbVersion = 1;
    }

    /**
     * Initialize IndexedDB
     */
    async initialize(userId) {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(`${this.dbName}_${userId}`, this.dbVersion);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('💾 IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Messages store
                if (!db.objectStoreNames.contains('messages')) {
                    const messageStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    messageStore.createIndex('conversation', ['userId', 'friendId'], { unique: false });
                    messageStore.createIndex('friendId', 'friendId', { unique: false });
                    messageStore.createIndex('timestamp', 'timestamp', { unique: false });
                    messageStore.createIndex('isRead', 'isRead', { unique: false });
                }

                // Call logs store (never synced to server)
                if (!db.objectStoreNames.contains('callLogs')) {
                    const callStore = db.createObjectStore('callLogs', { keyPath: 'id', autoIncrement: true });
                    callStore.createIndex('friendId', 'friendId', { unique: false });
                    callStore.createIndex('timestamp', 'timestamp', { unique: false });
                    callStore.createIndex('type', 'type', { unique: false });
                }

                // Read receipts store (client-side only)
                if (!db.objectStoreNames.contains('readReceipts')) {
                    const receiptStore = db.createObjectStore('readReceipts', { keyPath: 'messageId' });
                    receiptStore.createIndex('friendId', 'friendId', { unique: false });
                }

                // Typing indicators cache (ephemeral)
                if (!db.objectStoreNames.contains('typingStatus')) {
                    const typingStore = db.createObjectStore('typingStatus', { keyPath: 'friendId' });
                }

                console.log('💾 IndexedDB schema created');
            };
        });
    }

    /**
     * Save message to local storage
     */
    async saveMessage(message) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');

            const messageData = {
                userId: message.userId,
                friendId: message.friendId,
                senderId: message.senderId,
                receiverId: message.receiverId,
                message: message.message, // Encrypted blob
                encrypted_data: message.encrypted_data,
                encrypted_key: message.encrypted_key,
                iv: message.iv,
                timestamp: message.timestamp || Date.now(),
                isRead: message.isRead || false,
                isSent: message.isSent !== undefined ? message.isSent : true,
                isDelivered: message.isDelivered || false
            };

            const request = store.add(messageData);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get conversation messages
     */
    async getConversation(userId, friendId, limit = 50) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('conversation');

            const messages = [];
            const range = IDBKeyRange.only([userId, friendId]);
            const request = index.openCursor(range, 'prev'); // Newest first

            let count = 0;
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    messages.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(messages.reverse()); // Return oldest first
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Mark message as read (client-side only)
     */
    async markAsRead(messageId, friendId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['readReceipts'], 'readwrite');
            const store = transaction.objectStore('readReceipts');

            const receipt = {
                messageId: messageId,
                friendId: friendId,
                readAt: Date.now()
            };

            const request = store.put(receipt);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Update message read status
     */
    async updateMessageReadStatus(messageId, isRead) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readwrite');
            const store = transaction.objectStore('messages');

            const request = store.get(messageId);

            request.onsuccess = () => {
                const message = request.result;
                if (message) {
                    message.isRead = isRead;
                    const updateRequest = store.put(message);
                    updateRequest.onsuccess = () => resolve();
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve();
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get unread message count
     */
    async getUnreadCount(friendId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['messages'], 'readonly');
            const store = transaction.objectStore('messages');
            const index = store.index('friendId');

            let count = 0;
            const range = IDBKeyRange.only(friendId);
            const request = index.openCursor(range);

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    if (!cursor.value.isRead && cursor.value.senderId === friendId) {
                        count++;
                    }
                    cursor.continue();
                } else {
                    resolve(count);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Save call log (never synced to server)
     */
    async saveCallLog(callData) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['callLogs'], 'readwrite');
            const store = transaction.objectStore('callLogs');

            const log = {
                friendId: callData.friendId,
                friendName: callData.friendName,
                type: callData.type, // 'incoming', 'outgoing', 'missed'
                duration: callData.duration || 0, // seconds
                timestamp: Date.now()
            };

            const request = store.add(log);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get call logs
     */
    async getCallLogs(friendId = null, limit = 50) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['callLogs'], 'readonly');
            const store = transaction.objectStore('callLogs');

            const logs = [];
            let request;

            if (friendId) {
                const index = store.index('friendId');
                request = index.openCursor(IDBKeyRange.only(friendId), 'prev');
            } else {
                request = store.openCursor(null, 'prev');
            }

            let count = 0;
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && count < limit) {
                    logs.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(logs);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Set typing status (ephemeral)
     */
    async setTypingStatus(friendId, isTyping) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['typingStatus'], 'readwrite');
            const store = transaction.objectStore('typingStatus');

            const status = {
                friendId: friendId,
                isTyping: isTyping,
                timestamp: Date.now()
            };

            const request = store.put(status);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get typing status
     */
    async getTypingStatus(friendId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['typingStatus'], 'readonly');
            const store = transaction.objectStore('typingStatus');

            const request = store.get(friendId);

            request.onsuccess = () => {
                const status = request.result;
                if (status && Date.now() - status.timestamp < 5000) {
                    resolve(status.isTyping);
                } else {
                    resolve(false);
                }
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear all data (on logout)
     */
    async clearAll() {
        if (!this.db) return;

        const stores = ['messages', 'callLogs', 'readReceipts', 'typingStatus'];
        const transaction = this.db.transaction(stores, 'readwrite');

        for (const storeName of stores) {
            transaction.objectStore(storeName).clear();
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('💾 All local data cleared');
                resolve();
            };
            transaction.onerror = () => {
                reject(transaction.error);
            };
        });
    }

    /**
     * Delete database (complete removal)
     */
    async deleteDatabase(userId) {
        if (this.db) {
            this.db.close();
            this.db = null;
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(`${this.dbName}_${userId}`);

            request.onsuccess = () => {
                console.log('💾 Database deleted');
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }
}

// Global instance
// Global instance
window.chatStorage = new LocalStorage();
