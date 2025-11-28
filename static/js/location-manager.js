/**
 * Real-Time Location Manager
 * Handles ultra-fast location sharing with sub-100ms updates
 */

class LocationManager {
    constructor() {
        this.socket = null;
        this.currentLocation = null;
        this.lastSentLocation = null;
        this.watchId = null;
        this.isConnected = false;
        this.locationUpdateQueue = [];
        this.lastUpdateTime = 0;
        this.UPDATE_THROTTLE = 300; // 300ms throttle as requested
        this.MIN_DISTANCE_CHANGE = 2; // Only send if moved > 2 meters
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 5;
    }

    /**
     * Connect to WebSocket server
     */
    async connect(userId) {
        if (this.socket && this.isConnected) return;

        return new Promise((resolve, reject) => {
            // Use existing socket if available globally
            if (window.socket) {
                this.socket = window.socket;
                this.isConnected = true;
                resolve();
                return;
            }

            // Otherwise connect
            this.socket = io();

            this.socket.on('connect', () => {
                console.log('📍 Location Manager connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;

                // Register user for location updates
                this.socket.emit('register_location', { user_id: userId });
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                console.error('Location socket error:', error);
                this.isConnected = false;
                this.reconnectAttempts++;
                if (this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS) {
                    reject(error);
                }
            });

            this.socket.on('disconnect', () => {
                console.log('Location socket disconnected');
                this.isConnected = false;
            });

            // Expose globally
            window.socket = this.socket;
        });
    }

    /**
     * Calculate distance between two points in meters
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
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

                // Check throttle
                const now = Date.now();
                if (now - this.lastUpdateTime >= this.UPDATE_THROTTLE) {

                    // Check distance threshold
                    let shouldSend = false;
                    if (!this.lastSentLocation) {
                        shouldSend = true;
                    } else {
                        const distance = this.calculateDistance(
                            this.lastSentLocation.lat, this.lastSentLocation.lng,
                            newLocation.lat, newLocation.lng
                        );
                        if (distance > this.MIN_DISTANCE_CHANGE) {
                            shouldSend = true;
                        }
                    }

                    if (shouldSend) {
                        this.sendLocationUpdate(userId, newLocation);
                        this.lastUpdateTime = now;
                        this.lastSentLocation = newLocation;
                    }
                }

                // Call local callback (always update local UI immediately)
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
