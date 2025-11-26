/**
 * WebRTC Voice Call Module
 * 
 * Privacy Features:
 * - 100% peer-to-peer (no media through server)
 * - Signaling only (server just helps establish connection)
 * - No call duration tracking on server
 * - No call logs on server
 * - Ephemeral signaling (deleted immediately after handshake)
 */

class VoiceCallManager {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.currentCall = null;
        this.callStartTime = null;
        this.callTimer = null;

        // STUN servers (Google's free STUN servers)
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    /**
     * Initialize voice call manager
     */
    initialize() {
        this.setupSocketListeners();
        console.log('🎤 Voice call manager initialized');
    }

    /**
     * Setup Socket.IO listeners for call signaling
     */
    setupSocketListeners() {
        if (!window.socket) {
            console.error('Socket.IO not initialized');
            return;
        }

        // Incoming call
        socket.on('incoming_call', async (data) => {
            await this.handleIncomingCall(data);
        });

        // Call accepted
        socket.on('call_accepted', async (data) => {
            await this.handleCallAccepted(data);
        });

        // Call rejected
        socket.on('call_rejected', (data) => {
            this.handleCallRejected(data);
        });

        // Call ended
        socket.on('call_ended', (data) => {
            this.endCall();
        });

        // WebRTC signaling
        socket.on('webrtc_offer', async (data) => {
            await this.handleOffer(data);
        });

        socket.on('webrtc_answer', async (data) => {
            await this.handleAnswer(data);
        });

        socket.on('webrtc_ice_candidate', async (data) => {
            await this.handleIceCandidate(data);
        });
    }

    /**
     * Initiate voice call
     */
    async initiateCall(friendId, friendName) {
        try {
            // Request microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // Show outgoing call UI
            this.showOutgoingCallUI(friendName);

            // Send call request via Socket.IO
            socket.emit('initiate_call', {
                caller_id: currentUser.id,
                caller_name: currentUser.name,
                receiver_id: friendId
            });

            this.currentCall = {
                friendId: friendId,
                friendName: friendName,
                type: 'outgoing',
                status: 'calling'
            };

        } catch (error) {
            console.error('Failed to initiate call:', error);
            showToast('Failed to access microphone', 'error');
        }
    }

    /**
     * Handle incoming call
     */
    async handleIncomingCall(data) {
        this.currentCall = {
            friendId: data.caller_id,
            friendName: data.caller_name,
            type: 'incoming',
            status: 'ringing'
        };

        // Show incoming call modal
        this.showIncomingCallUI(data.caller_name, data.caller_id);

        // Play ringtone
        this.playRingtone();
    }

    /**
     * Accept incoming call
     */
    async acceptCall() {
        try {
            // Request microphone access
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // Notify caller
            socket.emit('accept_call', {
                caller_id: this.currentCall.friendId,
                receiver_id: currentUser.id
            });

            this.currentCall.status = 'connecting';
            this.hideIncomingCallUI();
            this.showActiveCallUI(this.currentCall.friendName);

        } catch (error) {
            console.error('Failed to accept call:', error);
            showToast('Failed to access microphone', 'error');
            this.rejectCall();
        }
    }

    /**
     * Reject incoming call
     */
    rejectCall() {
        socket.emit('reject_call', {
            caller_id: this.currentCall.friendId,
            receiver_id: currentUser.id
        });

        this.hideIncomingCallUI();
        this.stopRingtone();
        this.currentCall = null;

        // Save as missed call
        if (window.chatStorage && window.chatStorage.db) {
            window.chatStorage.saveCallLog({
                friendId: this.currentCall.friendId,
                friendName: this.currentCall.friendName,
                type: 'missed',
                duration: 0
            });
        }
    }

    /**
     * Handle call accepted
     */
    async handleCallAccepted(data) {
        this.currentCall.status = 'connecting';
        this.showActiveCallUI(this.currentCall.friendName);

        // Create peer connection and send offer
        await this.createPeerConnection(this.currentCall.friendId);
        await this.createOffer();
    }

    /**
     * Handle call rejected
     */
    handleCallRejected(data) {
        showToast('Call declined', 'info');
        this.endCall();
    }

    /**
     * Create WebRTC peer connection
     */
    async createPeerConnection(friendId) {
        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // Add local stream
        this.localStream.getTracks().forEach(track => {
            this.peerConnection.addTrack(track, this.localStream);
        });

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            this.remoteStream = event.streams[0];
            const remoteAudio = document.getElementById('remote-audio');
            if (remoteAudio) {
                remoteAudio.srcObject = this.remoteStream;
            }

            // Call connected
            if (this.currentCall.status === 'connecting') {
                this.currentCall.status = 'active';
                this.startCallTimer();
            }
        };

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc_ice_candidate', {
                    receiver_id: friendId,
                    candidate: event.candidate
                });
            }
        };

        // Handle connection state
        this.peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', this.peerConnection.connectionState);
            if (this.peerConnection.connectionState === 'connected') {
                this.currentCall.status = 'active';
                this.startCallTimer();
            } else if (this.peerConnection.connectionState === 'disconnected' ||
                this.peerConnection.connectionState === 'failed') {
                this.endCall();
            }
        };
    }

    /**
     * Create WebRTC offer
     */
    async createOffer() {
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            socket.emit('webrtc_offer', {
                receiver_id: this.currentCall.friendId,
                offer: offer
            });
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.endCall();
        }
    }

    /**
     * Handle WebRTC offer
     */
    async handleOffer(data) {
        try {
            await this.createPeerConnection(data.sender_id);
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            socket.emit('webrtc_answer', {
                receiver_id: data.sender_id,
                answer: answer
            });
        } catch (error) {
            console.error('Failed to handle offer:', error);
            this.endCall();
        }
    }

    /**
     * Handle WebRTC answer
     */
    async handleAnswer(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
            console.error('Failed to handle answer:', error);
            this.endCall();
        }
    }

    /**
     * Handle ICE candidate
     */
    async handleIceCandidate(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            audioTrack.enabled = !audioTrack.enabled;

            const muteBtn = document.getElementById('mute-btn');
            if (muteBtn) {
                muteBtn.textContent = audioTrack.enabled ? '🔊 Mute' : '🔇 Unmute';
                muteBtn.style.background = audioTrack.enabled ? 'var(--bg-secondary)' : 'var(--brutalist-red)';
            }
        }
    }

    /**
     * End call
     */
    endCall() {
        // Calculate duration
        const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;

        // Save call log locally (never sent to server)
        if (this.currentCall && window.chatStorage && window.chatStorage.db) {
            window.chatStorage.saveCallLog({
                friendId: this.currentCall.friendId,
                friendName: this.currentCall.friendName,
                type: this.currentCall.type,
                duration: duration
            });
        }

        // Notify other peer
        if (this.currentCall) {
            socket.emit('end_call', {
                receiver_id: this.currentCall.friendId
            });
        }

        // Stop call timer
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Clear remote stream
        this.remoteStream = null;

        // Hide call UI
        this.hideCallUI();

        // Reset state
        this.currentCall = null;
        this.callStartTime = null;

        showToast('Call ended', 'info');
    }

    /**
     * Start call timer
     */
    startCallTimer() {
        this.callStartTime = Date.now();
        this.callTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            const timerEl = document.getElementById('call-timer');
            if (timerEl) {
                timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }, 1000);
    }

    /**
     * UI Methods
     */
    showIncomingCallUI(callerName, callerId) {
        const modal = document.createElement('div');
        modal.id = 'incoming-call-modal';
        modal.className = 'call-modal';
        modal.innerHTML = `
            <div class="call-modal-content">
                <div class="caller-photo">📞</div>
                <h2>${callerName}</h2>
                <p>Incoming voice call...</p>
                <div class="call-actions">
                    <button class="call-btn accept-btn" onclick="voiceCall.acceptCall()">✅ Accept</button>
                    <button class="call-btn reject-btn" onclick="voiceCall.rejectCall()">❌ Decline</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    hideIncomingCallUI() {
        const modal = document.getElementById('incoming-call-modal');
        if (modal) modal.remove();
    }

    showOutgoingCallUI(friendName) {
        const modal = document.createElement('div');
        modal.id = 'outgoing-call-modal';
        modal.className = 'call-modal';
        modal.innerHTML = `
            <div class="call-modal-content">
                <div class="caller-photo">📞</div>
                <h2>${friendName}</h2>
                <p>Calling...</p>
                <div class="call-actions">
                    <button class="call-btn reject-btn" onclick="voiceCall.endCall()">❌ Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showActiveCallUI(friendName) {
        // Remove previous modals
        this.hideIncomingCallUI();
        const outgoing = document.getElementById('outgoing-call-modal');
        if (outgoing) outgoing.remove();

        const modal = document.createElement('div');
        modal.id = 'active-call-modal';
        modal.className = 'call-modal';
        modal.innerHTML = `
            <div class="call-modal-content">
                <div class="caller-photo-large">📞</div>
                <h2>${friendName}</h2>
                <p id="call-timer">00:00</p>
                <audio id="remote-audio" autoplay></audio>
                <div class="call-controls">
                    <button class="call-control-btn" id="mute-btn" onclick="voiceCall.toggleMute()">🔊 Mute</button>
                    <button class="call-control-btn end-call-btn" onclick="voiceCall.endCall()">📞 End Call</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    hideCallUI() {
        const modals = ['incoming-call-modal', 'outgoing-call-modal', 'active-call-modal'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (modal) modal.remove();
        });
    }

    playRingtone() {
        // Use notification sound for ringtone
        const audio = document.getElementById('notification-sound');
        if (audio) {
            audio.loop = true;
            audio.play();
        }
    }

    stopRingtone() {
        const audio = document.getElementById('notification-sound');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio.loop = false;
        }
    }
}

// Global instance
window.voiceCall = new VoiceCallManager();
