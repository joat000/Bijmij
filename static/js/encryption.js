/**
 * End-to-End Encryption Module
 * Uses Web Crypto API for RSA-2048 and AES-256-GCM encryption
 * 
 * Privacy Features:
 * - Client-side encryption only
 * - Private keys never leave browser
 * - Each message gets unique AES key
 * - Server only sees encrypted blobs
 */

class E2EEncryption {
    constructor() {
        this.publicKey = null;
        this.privateKey = null;
        this.friendPublicKeys = new Map(); // Store friends' public keys
    }

    /**
     * Initialize encryption for user
     * Generates RSA key pair or loads from localStorage
     */
    async initialize(userId) {
        const storedPrivateKey = localStorage.getItem(`privateKey_${userId}`);
        const storedPublicKey = localStorage.getItem(`publicKey_${userId}`);

        if (storedPrivateKey && storedPublicKey) {
            // Load existing keys
            this.privateKey = await this.importPrivateKey(storedPrivateKey);
            this.publicKey = await this.importPublicKey(storedPublicKey);
            console.log('🔐 Loaded existing encryption keys');
        } else {
            // Generate new key pair
            await this.generateKeyPair(userId);
            console.log('🔐 Generated new encryption keys');
        }

        return this.publicKey;
    }

    /**
     * Generate RSA-2048 key pair
     */
    async generateKeyPair(userId) {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );

        this.publicKey = keyPair.publicKey;
        this.privateKey = keyPair.privateKey;

        // Export and store keys
        const exportedPublicKey = await this.exportPublicKey(keyPair.publicKey);
        const exportedPrivateKey = await this.exportPrivateKey(keyPair.privateKey);

        localStorage.setItem(`publicKey_${userId}`, exportedPublicKey);
        localStorage.setItem(`privateKey_${userId}`, exportedPrivateKey);
    }

    /**
     * Export public key to base64 string
     */
    async exportPublicKey(key) {
        const exported = await window.crypto.subtle.exportKey('spki', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Export private key to base64 string
     */
    async exportPrivateKey(key) {
        const exported = await window.crypto.subtle.exportKey('pkcs8', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import public key from base64 string
     */
    async importPublicKey(base64Key) {
        const buffer = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'spki',
            buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            true,
            ['encrypt']
        );
    }

    /**
     * Import private key from base64 string
     */
    async importPrivateKey(base64Key) {
        const buffer = this.base64ToArrayBuffer(base64Key);
        return await window.crypto.subtle.importKey(
            'pkcs8',
            buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            true,
            ['decrypt']
        );
    }

    /**
     * Encrypt message for recipient
     * Returns: {encrypted_data, encrypted_key, iv}
     */
    async encryptMessage(message, recipientPublicKey) {
        // 1. Generate random AES-256 key
        const aesKey = await window.crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );

        // 2. Generate random IV
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        // 3. Encrypt message with AES key
        const encoder = new TextEncoder();
        const messageBuffer = encoder.encode(message);
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            aesKey,
            messageBuffer
        );

        // 4. Export AES key
        const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

        // 5. Encrypt AES key with recipient's RSA public key
        const encryptedKey = await window.crypto.subtle.encrypt(
            {
                name: 'RSA-OAEP'
            },
            recipientPublicKey,
            exportedAesKey
        );

        // 6. Return encrypted package
        return {
            encrypted_data: this.arrayBufferToBase64(encryptedData),
            encrypted_key: this.arrayBufferToBase64(encryptedKey),
            iv: this.arrayBufferToBase64(iv)
        };
    }

    /**
     * Decrypt message
     */
    async decryptMessage(encryptedPackage) {
        try {
            // 1. Decrypt AES key with private RSA key
            const encryptedKeyBuffer = this.base64ToArrayBuffer(encryptedPackage.encrypted_key);
            const aesKeyBuffer = await window.crypto.subtle.decrypt(
                {
                    name: 'RSA-OAEP'
                },
                this.privateKey,
                encryptedKeyBuffer
            );

            // 2. Import AES key
            const aesKey = await window.crypto.subtle.importKey(
                'raw',
                aesKeyBuffer,
                {
                    name: 'AES-GCM',
                    length: 256
                },
                false,
                ['decrypt']
            );

            // 3. Decrypt message with AES key
            const encryptedDataBuffer = this.base64ToArrayBuffer(encryptedPackage.encrypted_data);
            const ivBuffer = this.base64ToArrayBuffer(encryptedPackage.iv);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: ivBuffer
                },
                aesKey,
                encryptedDataBuffer
            );

            // 4. Decode message
            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            console.error('Decryption failed:', error);
            return '[Decryption failed]';
        }
    }

    /**
     * Store friend's public key
     */
    async storeFriendPublicKey(friendId, publicKeyBase64) {
        const publicKey = await this.importPublicKey(publicKeyBase64);
        this.friendPublicKeys.set(friendId, publicKey);

        // Also cache in localStorage
        localStorage.setItem(`friendPublicKey_${friendId}`, publicKeyBase64);
    }

    /**
     * Get friend's public key
     */
    async getFriendPublicKey(friendId) {
        if (this.friendPublicKeys.has(friendId)) {
            return this.friendPublicKeys.get(friendId);
        }

        // Try loading from localStorage
        const cached = localStorage.getItem(`friendPublicKey_${friendId}`);
        if (cached) {
            const publicKey = await this.importPublicKey(cached);
            this.friendPublicKeys.set(friendId, publicKey);
            return publicKey;
        }

        // Fetch from server
        try {
            const response = await fetch(`/api/users/${friendId}/public-key`);
            if (response.ok) {
                const data = await response.json();
                await this.storeFriendPublicKey(friendId, data.public_key);
                return this.friendPublicKeys.get(friendId);
            }
        } catch (error) {
            console.error('Failed to fetch friend public key:', error);
        }

        return null;
    }

    /**
     * Utility: ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    /**
     * Utility: Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
        const binary = window.atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Get public key as base64 string (for sharing with server)
     */
    async getPublicKeyString() {
        return await this.exportPublicKey(this.publicKey);
    }
}

// Global instance
window.encryption = new E2EEncryption();
