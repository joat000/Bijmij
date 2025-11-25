/**
 * Real-Time Location Manager
 * Handles ultra-fast location sharing with sub-100ms updates
 */

class LocationManager {
    constructor() {
        this.socket = null;
        this.currentLocation = null;
        this.watchId = null;
        this.isConnected = false;
        this.locationUpdateQueue = [];
        this.lastUpdateTime = 0;
        this.UPDATE_THROTTLE = 100; // 100ms minimum between updates
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 5;
    }

    /**
     * Initialize WebSocket connection
     */
    connect(userId) {
        return new Promise((resolve, reject) => {
            try {
                // Connect to WebSocket server
                this.socket = io('http://localhost:5000', {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionDelay: 1000,
                    reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS
                });

                this.socket.on('connect', () => {
                    console.log('✅ WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;

                    // Announce user is online
                    this.socket.emit('user_online', {
                        user_id: userId,
                        lat: this.currentLocation?.lat,
                        lng: this.currentLocation?.lng
                    });

                    resolve();
                });

                this.socket.on('disconnect', () => {
                    console.log('❌ WebSocket disconnected');
                    this.isConnected = false;
                });

                this.socket.on('connect_error', (error) => {
                    console.error('WebSocket connection error:', error);
                    this.reconnectAttempts++;
                    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
                        reject(new Error('Failed to connect to real-time server'));
                    }
                });

                // Listen for location updates from other users
                this.socket.on('location_updated', (data) => {
                    this.handleRemoteLocationUpdate(data);
                });

                // Listen for update confirmations
                this.socket.on('location_update_confirmed', (data) => {
                    console.log(`📍 Location update latency: ${data.latency_ms}ms`);
                    if (window.showLatencyIndicator) {
                        window.showLatencyIndicator(data.latency_ms);
                    }
                });

                // Listen for user online/offline events
                this.socket.on('user_online', (data) => {
                    console.log(`👤 User ${data.user_id} came online`);
                    if (window.onUserOnline) {
                        window.onUserOnline(data.user_id);
                    }
                });

                this.socket.on('user_offline', (data) => {
                    console.log(`👤 User ${data.user_id} went offline`);
                    if (window.onUserOffline) {
                        window.onUserOffline(data.user_id);
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Start watching user's location with high accuracy
     */
    startLocationTracking(userId, onLocationUpdate) {
        if (!navigator.geolocation) {
            throw new Error('Geolocation not supported');
        }

        const options = {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0 // Always get fresh location
        };

        // Watch position for continuous updates
        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const newLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now()
                };

                this.currentLocation = newLocation;

                // Throttle updates to prevent overwhelming the server
                const now = Date.now();
                if (now - this.lastUpdateTime >= this.UPDATE_THROTTLE) {
                    this.sendLocationUpdate(userId, newLocation);
                    this.lastUpdateTime = now;
                }

                // Call local callback
                if (onLocationUpdate) {
                    onLocationUpdate(newLocation);
                }
            },
            (error) => {
                console.error('Location error:', error);
                // Fallback to getCurrentPosition
                this.getLocationOnce(userId, onLocationUpdate);
            },
            options
        );
    }

    /**
     * Get location once (fallback)
     */
    getLocationOnce(userId, onLocationUpdate) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const location = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now()
                };

                this.currentLocation = location;
                this.sendLocationUpdate(userId, location);

                if (onLocationUpdate) {
                    onLocationUpdate(location);
                }
            },
            (error) => {
                console.error('Failed to get location:', error);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    /**
     * Send location update via WebSocket (ultra-fast)
     */
    sendLocationUpdate(userId, location) {
        if (!this.isConnected || !this.socket) {
            console.warn('WebSocket not connected, queuing update');
            this.locationUpdateQueue.push({ userId, location });
            return;
        }

        const startTime = performance.now();

        // Send via WebSocket for instant broadcast
        this.socket.emit('location_update', {
            user_id: userId,
            lat: location.lat,
            lng: location.lng,
            timestamp: location.timestamp
        });

        // Also update via HTTP as backup (async, non-blocking)
        this.sendLocationUpdateHTTP(userId, location).catch(err => {
            console.warn('HTTP location update failed:', err);
        });
    }

    /**
     * HTTP fallback for location updates
     */
    async sendLocationUpdateHTTP(userId, location) {
        try {
            await fetch(`/api/users/${userId}/location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latitude: location.lat,
                    longitude: location.lng
                })
            });
        } catch (error) {
            console.error('HTTP location update error:', error);
        }
    }

    /**
     * Handle location updates from other users
     */
    handleRemoteLocationUpdate(data) {
        console.log(`📍 Received location update from user ${data.user_id}`);

        // Immediately update map marker (optimistic UI)
        if (window.updateUserMarker) {
            window.updateUserMarker(data.user_id, data.lat, data.lng);
        }

        // Update user card if visible
        if (window.updateUserCard) {
            window.updateUserCard(data.user_id, data.lat, data.lng);
        }
    }

    /**
     * Request nearby users (real-time)
     */
    requestNearbyUsers(userId, location, radius = 50, worldwide = false) {
        return new Promise((resolve) => {
            if (!this.isConnected || !this.socket) {
                resolve([]);
                return;
            }

            // Set up one-time listener for response
            this.socket.once('nearby_users_response', (data) => {
                resolve(data.users || []);
            });

            // Send request
            this.socket.emit('request_nearby_users', {
                user_id: userId,
                lat: location.lat,
                lng: location.lng,
                radius: radius,
                worldwide: worldwide
            });

            // Timeout after 2 seconds
            setTimeout(() => resolve([]), 2000);
        });
    }

    /**
     * Stop location tracking
     */
    stopLocationTracking() {
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.stopLocationTracking();
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }

    /**
     * Get current location
     */
    getCurrentLocation() {
        return this.currentLocation;
    }

    /**
     * Check if connected
     */
    isSocketConnected() {
        return this.isConnected;
    }
}

// Export for use in app.js
window.LocationManager = LocationManager;
