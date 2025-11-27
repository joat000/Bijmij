/**
 * Enhanced Chat Interface Module
 * 
 * Features:
 * - Read receipts (client-side only)
 * - Typing indicators (ephemeral)
 * - Online status
 * - Intelligent auto-scroll
 * - Message grouping
 * - Date separators
 * - Smart timestamps
 */

class EnhancedChat {
    constructor() {
        this.currentFriendId = null;
        this.currentFriendName = null;
        this.typingTimeout = null;
        this.scrollPosition = {};
        this.unreadMessages = {};
        this.lastMessageTimestamp = {};
        this.onlineUsers = new Set();
    }

    /**
     * Initialize enhanced chat
     */
    initialize() {
        this.setupSocketListeners();
        this.setupInputHandlers();
        console.log('💬 Enhanced chat initialized');
    }

    /**
     * Setup Socket.IO listeners
     */
    setupSocketListeners() {
        if (!window.socket) return;

        // Typing indicators
        socket.on('user_typing', (data) => {
            this.showTypingIndicator(data.user_id, data.user_name);
        });

        socket.on('user_stopped_typing', (data) => {
            this.hideTypingIndicator(data.user_id);
        });

        // Online status
        socket.on('user_online', (data) => {
            this.onlineUsers.add(data.user_id);
            this.updateOnlineStatus(data.user_id, true);
        });

        socket.on('user_offline', (data) => {
            this.onlineUsers.delete(data.user_id);
            this.updateOnlineStatus(data.user_id, false);
        });

        // Read receipts
        socket.on('message_read', (data) => {
            this.updateMessageReadStatus(data.message_id, true);
        });

        // Message delivered
        socket.on('message_delivered', (data) => {
            this.updateMessageDeliveredStatus(data.message_id);
        });

        // Message sent confirmation (from server)
        socket.on('message_sent_confirmed', (data) => {
            this.updateMessageSentStatus(data.local_message_id, data.server_message_id, data.timestamp);
        });

        // Message sent error
        socket.on('message_sent_error', (data) => {
            console.error('Message send error:', data.error);
            // Optionally show error to user
        });

        // New message
        socket.on('new_message_realtime', async (data) => {
            await this.handleIncomingMessage(data);
        });

        // Image chunks
        socket.on('receive_image_chunk', async (data) => {
            await this.handleImageChunk(data);
        });
    }

    // ... (setupInputHandlers remains same)

    /**
     * Start chat with friend
     */
    async startChat(friendId, friendName) {
        this.currentFriendId = friendId;
        this.currentFriendName = friendName;

        // Update chat header
        this.updateChatHeader(friendName, friendId);

        // Load messages from API (not IndexedDB anymore, or fetch from API then store?)
        // For simplicity and robustness, let's fetch from API.
        // But wait, the previous implementation used IndexedDB for offline support.
        // Let's keep fetching from API for now to ensure we get latest history.
        await this.loadMessages();

        // Enable input
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-msg-btn');
        if (chatInput) chatInput.disabled = false;
        if (sendBtn) sendBtn.disabled = false;

        // Scroll to bottom
        this.scrollToBottom();

        // Mark messages as read (if we have API for it)
        // this.markConversationAsRead(friendId); 
    }

    /**
     * Update chat header
     */
    updateChatHeader(friendName, friendId) {
        const header = document.getElementById('chat-header');
        if (!header) return;

        const isOnline = this.onlineUsers.has(friendId);
        const onlineStatus = isOnline ?
            '<span class="online-indicator">● Online</span>' :
            '<span class="offline-indicator">○ Offline</span>';

        header.innerHTML = `
            <div class="chat-user-info">
                <span id="chat-with-name">${friendName}</span>
                ${onlineStatus}
            </div>
            <div class="chat-header-actions">
                <!-- Voice call and encryption removed -->
            </div>
        `;
    }

    /**
     * Load messages from API
     */
    async loadMessages() {
        try {
            const response = await fetch(`/api/messages/${this.currentFriendId}`);
            const messages = await response.json();

            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;

            chatMessages.innerHTML = '';

            if (messages.length === 0) {
                chatMessages.innerHTML = `
                    <div class="empty-chat-state">
                        💬 No messages yet. Say hi! 👋
                    </div>
                `;
                return;
            }

            let lastDate = null;
            let lastSenderId = null;

            // Messages from API are usually sorted by date
            for (const msg of messages) {
                // Add date separator
                const msgDate = new Date(msg.created_at || msg.timestamp);
                const dateStr = this.formatDate(msgDate);
                if (dateStr !== lastDate) {
                    chatMessages.innerHTML += `
                        <div class="date-separator">
                            <span>${dateStr}</span>
                        </div>
                    `;
                    lastDate = dateStr;
                }

                // Determine if message should be grouped
                const grouped = lastSenderId === msg.sender_id;
                lastSenderId = msg.sender_id;

                // Render message
                this.renderMessage({
                    id: msg.id,
                    senderId: msg.sender_id,
                    message: msg.message,
                    timestamp: msg.created_at || msg.timestamp,
                    isRead: msg.is_read,
                    isSent: true, // It's from history, so it's sent
                    isDelivered: true, // Assume delivered if in history
                    grouped: grouped
                });
            }

            this.scrollToBottom();
        } catch (error) {
            console.error('Error loading messages:', error);
        }
    }

    /**
     * Send message
     */
    async sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message || !this.currentFriendId) return;

        const localId = Date.now().toString();

        // Optimistic UI
        this.renderMessage({
            id: localId,
            senderId: currentUser.id,
            message: message,
            timestamp: new Date().toISOString(),
            isRead: false,
            isSent: false, // Will be true when confirmed
            isDelivered: false,
            grouped: false // Simplified for optimistic
        });

        this.scrollToBottom();
        input.value = '';

        // Emit to server
        socket.emit('send_message', {
            sender_id: currentUser.id,
            receiver_id: this.currentFriendId,
            message: message,
            local_message_id: localId
        });
    }

    /**
     * Handle incoming message
     */
    async handleIncomingMessage(data) {
        // Only render if we are chatting with this person
        if (this.currentFriendId == data.sender_id) {
            this.renderMessage({
                id: data.server_message_id || data.id,
                senderId: data.sender_id,
                message: data.message,
                timestamp: data.timestamp,
                isRead: false,
                isSent: true,
                isDelivered: true,
                grouped: false
            });
            this.scrollToBottom();

            // Send read receipt
            socket.emit('send_read_receipt', {
                message_id: data.server_message_id || data.id,
                sender_id: data.sender_id
            });
        } else {
            // Show notification or update unread count in list
            // (This logic might be in app.js or handled by a global listener)
            if (window.updateChatListUnread) {
                window.updateChatListUnread(data.sender_id);
            }
        }
    }

    /**
     * Update message sent status (confirmation from server)
     */
    updateMessageSentStatus(localId, serverId, timestamp) {
        const msgEl = document.querySelector(`.chat-message[data-message-id="${localId}"]`);
        if (msgEl) {
            msgEl.dataset.messageId = serverId;
            const meta = msgEl.querySelector('.message-meta');
            if (meta) {
                // Update timestamp if needed
                // Update tick to sent
                const receipt = meta.querySelector('.read-receipt');
                if (receipt) {
                    receipt.className = 'read-receipt sent';
                    receipt.innerHTML = '✓';
                } else {
                    meta.innerHTML += '<span class="read-receipt sent">✓</span>';
                }
            }
        }
    }


    /**
     * Render single message
     */
    renderMessage(msg) {
        const chatMessages = document.getElementById('chat-messages');
        if (!chatMessages) return;

        const isSent = msg.senderId === currentUser.id;
        const messageClass = isSent ? 'message-sent' : 'message-received';
        const groupedClass = msg.grouped ? 'message-grouped' : '';

        // Read receipt indicators
        let readReceipt = '';
        if (isSent) {
            if (msg.isRead) {
                readReceipt = '<span class="read-receipt read">✓✓</span>';
            } else if (msg.isDelivered) {
                readReceipt = '<span class="read-receipt delivered">✓✓</span>';
            } else if (msg.isSent) {
                readReceipt = '<span class="read-receipt sent">✓</span>';
            }
        }

        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${messageClass} ${groupedClass}`;
        messageEl.dataset.messageId = msg.id;

        let contentHtml = `<p>${this.escapeHtml(msg.message)}</p>`;

        // Check if message is an image
        if (msg.message.startsWith('data:image')) {
            contentHtml = `<img src="${msg.message}" class="chat-image" onclick="window.open(this.src)" style="max-width: 200px; border-radius: 10px; cursor: pointer;">`;
        }

        messageEl.innerHTML = `
            <div class="message-content">
                ${contentHtml}
                <div class="message-meta">
                    <span class="message-time">${this.formatTime(msg.timestamp)}</span>
                    ${readReceipt}
                </div>
            </div>
        `;
        handleTyping() {
            // Send typing event
            socket.emit('typing', {
                user_id: currentUser.id,
                user_name: currentUser.name,
                receiver_id: this.currentFriendId
            });

            // Clear previous timeout
            if (this.typingTimeout) {
                clearTimeout(this.typingTimeout);
            }

            // Stop typing after 3 seconds
            this.typingTimeout = setTimeout(() => {
                this.stopTyping();
            }, 3000);
        }

        stopTyping() {
            socket.emit('stopped_typing', {
                user_id: currentUser.id,
                receiver_id: this.currentFriendId
            });
        }

        showTypingIndicator(userId, userName) {
            if (userId !== this.currentFriendId) return;

            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;

            // Remove existing indicator
            const existing = document.getElementById('typing-indicator');
            if (existing) existing.remove();

            const indicator = document.createElement('div');
            indicator.id = 'typing-indicator';
            indicator.className = 'typing-indicator';
            indicator.innerHTML = `
            <div class="typing-dots">
                <span></span><span></span><span></span>
            </div>
            <span class="typing-text">${userName} is typing...</span>
        `;

            chatMessages.appendChild(indicator);
            this.scrollToBottom();
        }

        hideTypingIndicator(userId) {
            if (userId !== this.currentFriendId) return;

            const indicator = document.getElementById('typing-indicator');
            if (indicator) indicator.remove();
        }

        /**
         * Update online status
         */
        updateOnlineStatus(userId, isOnline) {
            // Update chat header if chatting with this user
            if (userId === this.currentFriendId) {
                this.updateChatHeader(this.currentFriendName, userId);
            }

            // Update chat list
            const chatItem = document.querySelector(`[data-friend-id="${userId}"]`);
            if (chatItem) {
                const statusEl = chatItem.querySelector('.online-status');
                if (statusEl) {
                    statusEl.textContent = isOnline ? '● Online' : '○ Offline';
                    statusEl.className = isOnline ? 'online-status online' : 'online-status offline';
                }
            }
        }

    /**
     * Mark message as read
     */
    async markMessageAsRead(messageId) {
            if (window.chatStorage && window.chatStorage.db) {
                await window.chatStorage.updateMessageReadStatus(messageId, true);
            }
        }

    /**
     * Mark conversation as read
     */
    async markConversationAsRead(friendId) {
            // Update unread count
            this.unreadMessages[friendId] = 0;
            this.updateChatListUnread(friendId);
        }

        /**
         * Update message sent status
         */
        updateMessageSentStatus(messageId) {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                const receipt = messageEl.querySelector('.read-receipt');
                if (receipt) {
                    receipt.className = 'read-receipt sent';
                    receipt.textContent = '✓';
                }
            }
        }

        /**
         * Update message delivered status
         */
        updateMessageDeliveredStatus(messageId) {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                const receipt = messageEl.querySelector('.read-receipt');
                if (receipt) {
                    receipt.className = 'read-receipt delivered';
                    receipt.textContent = '✓✓';
                }
            }
        }

        /**
         * Update message read status
         */
        updateMessageReadStatus(messageId, isRead) {
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            if (messageEl) {
                const receipt = messageEl.querySelector('.read-receipt');
                if (receipt && isRead) {
                    receipt.className = 'read-receipt read';
                    receipt.textContent = '✓✓';
                }
            }
        }

        /**
         * Update chat list unread count
         */
        updateChatListUnread(friendId) {
            const chatItem = document.querySelector(`[data-friend-id="${friendId}"]`);
            if (chatItem) {
                let badge = chatItem.querySelector('.unread-badge');
                const count = this.unreadMessages[friendId] || 0;

                if (count > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'unread-badge';
                        chatItem.appendChild(badge);
                    }
                    badge.textContent = count;
                } else {
                    if (badge) badge.remove();
                }
            }
        }

        /**
         * Intelligent auto-scroll
         */
        scrollToBottom(force = false) {
            const chatMessages = document.getElementById('chat-messages');
            if (!chatMessages) return;

            const isAtBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 100;

            if (force || isAtBottom) {
                chatMessages.scrollTo({
                    top: chatMessages.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }

        /**
         * Format date for separator
         */
        formatDate(date) {
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                return 'Today';
            } else if (date.toDateString() === yesterday.toDateString()) {
                return 'Yesterday';
            } else {
                return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            }
        }

        /**
         * Format time for message
         */
        formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = Date.now();
            const diff = now - timestamp;

            if (diff < 60000) {
                return 'Just now';
            } else if (diff < 3600000) {
                const mins = Math.floor(diff / 60000);
                return `${mins} min${mins > 1 ? 's' : ''} ago`;
            } else {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            }
        }

    /**
     * Handle image selection
     */
    async handleImageSelection(file) {
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showToast('Image too large (max 5MB)', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const imageData = e.target.result;
                await this.sendImage(imageData);
            };
            reader.readAsDataURL(file);
        }

    /**
     * Send image message
     */
    async sendImage(imageData) {
            // 1. Save locally and render
            const messageData = {
                userId: currentUser.id,
                friendId: this.currentFriendId,
                senderId: currentUser.id,
                receiverId: this.currentFriendId,
                message: imageData, // Store base64 image
                timestamp: Date.now(),
                isRead: false,
                isSent: false,
                isDelivered: false
            };

            const messageId = await window.chatStorage.saveMessage(messageData);

            this.renderMessage({
                id: messageId,
                senderId: currentUser.id,
                message: imageData,
                timestamp: Date.now(),
                isRead: false,
                isSent: false,
                isDelivered: false,
                grouped: false
            });
            this.scrollToBottom();

            // 2. Chunk and send
            const CHUNK_SIZE = 100 * 1024; // 100KB chunks
            const totalChunks = Math.ceil(imageData.length / CHUNK_SIZE);
            const transferId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

            for (let i = 0; i < totalChunks; i++) {
                const chunk = imageData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                socket.emit('send_image_chunk', {
                    receiver_id: this.currentFriendId,
                    sender_id: currentUser.id,
                    chunk: chunk,
                    chunk_index: i,
                    total_chunks: totalChunks,
                    transfer_id: transferId
                });
            }
        }

    /**
     * Handle incoming image chunk
     */
    async handleImageChunk(data) {
            if (!this.imageTransfers) this.imageTransfers = {};

            if (!this.imageTransfers[data.transfer_id]) {
                this.imageTransfers[data.transfer_id] = {
                    chunks: [],
                    count: 0,
                    total: data.total_chunks,
                    sender_id: data.sender_id
                };
            }

            const transfer = this.imageTransfers[data.transfer_id];
            transfer.chunks[data.chunk_index] = data.chunk;
            transfer.count++;

            if (transfer.count === transfer.total) {
                // All chunks received
                const fullImage = transfer.chunks.join('');
                delete this.imageTransfers[data.transfer_id];

                // Process as a normal message
                await this.handleIncomingMessage({
                    sender_id: transfer.sender_id,
                    sender_name: this.currentFriendName || 'Friend', // Fallback
                    encrypted_data: null, // Not encrypted in this simple implementation
                    message: fullImage // Pass directly if not encrypted
                }, true); // isImage flag
            }
        }

    /**
     * Override handleIncomingMessage to support direct image data
     */
    async handleIncomingMessage(data, isImage = false) {
            let messageText = '[Encrypted message]';

            if (isImage) {
                messageText = data.message;
            } else if (data.encrypted_data && window.encryption) {
                try {
                    messageText = await window.encryption.decryptMessage({
                        encrypted_data: data.encrypted_data,
                        encrypted_key: data.encrypted_key,
                        iv: data.iv
                    });
                } catch (error) {
                    console.error('Failed to decrypt message:', error);
                }
            }

            // Save to IndexedDB
            const messageData = {
                userId: currentUser.id,
                friendId: data.sender_id,
                senderId: data.sender_id,
                receiverId: currentUser.id,
                message: messageText,
                timestamp: Date.now(),
                isRead: false,
                isSent: true,
                isDelivered: true
            };

            const messageId = await window.chatStorage.saveMessage(messageData);

            // If chat is open with this friend, render message
            if (this.currentFriendId === data.sender_id) {
                this.renderMessage({
                    id: messageId,
                    senderId: data.sender_id,
                    message: messageText,
                    timestamp: Date.now(),
                    isRead: false,
                    isSent: true,
                    isDelivered: true,
                    grouped: false
                });

                this.scrollToBottom();
                this.markMessageAsRead(messageId);

                if (!isImage) { // Don't send read receipt for image chunks logic yet
                    socket.emit('send_read_receipt', {
                        message_id: data.server_message_id,
                        sender_id: data.sender_id
                    });
                }
            } else {
                this.unreadMessages[data.sender_id] = (this.unreadMessages[data.sender_id] || 0) + 1;
                this.updateChatListUnread(data.sender_id);
            }

            const audio = document.getElementById('notification-sound');
            if (audio) audio.play();
            showToast(`New message from ${data.sender_name || 'Friend'}`, 'info');
        }

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

// Global instance
window.enhancedChat = new EnhancedChat();
