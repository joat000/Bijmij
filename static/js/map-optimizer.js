/**
 * Map Optimizer - Improves map loading performance (2D Only)
 */

class MapOptimizer {
    constructor() {
        this.mapInstance = null;
        this.tileLayer = null;
    }

    /**
     * Initialize optimized 2D map with lazy loading and performance tweaks
     */
    initOptimized2DMap(containerId, lat, lng, zoom = 13) {
        if (this.mapInstance) {
            this.mapInstance.setView([lat, lng], zoom);
            return this.mapInstance;
        }

        // Create map with optimized settings
        this.mapInstance = L.map(containerId, {
            preferCanvas: true, // Use canvas for better performance with many markers
            zoomControl: true,
            attributionControl: false,
            fadeAnimation: true,
            markerZoomAnimation: true
        }).setView([lat, lng], zoom);

        // Use faster tile provider with aggressive caching settings
        this.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
            minZoom: 2,
            updateWhenIdle: true, // Only update tiles when map is idle
            updateWhenZooming: false, // Don't update during zoom
            keepBuffer: 4, // Keep more tiles in buffer for smoother panning
            crossOrigin: true
        }).addTo(this.mapInstance);

        return this.mapInstance;
    }

    /**
     * Add marker with optimized rendering
     */
    addMarker(lat, lng, options = {}) {
        if (!this.mapInstance) return null;

        const marker = L.marker([lat, lng], options);

        if (options.popup) {
            marker.bindPopup(options.popup);
        }

        return marker.addTo(this.mapInstance);
    }

    /**
     * Clear all markers (helper for app.js)
     */
    clearMarkers() {
        // In Leaflet, markers are usually managed by a LayerGroup in the main app.
        // This method is kept for compatibility if the app calls it.
        // If the app manages markers individually, this might not be needed here,
        // but we can implement a clear logic if we tracked markers.
        // For now, we assume the app clears its own layer group.
    }

    /**
     * Preload map tiles for faster rendering
     */
    preloadTiles(bounds) {
        if (this.mapInstance) {
            // Leaflet handles preloading with keepBuffer, but we can force a bounds check
            // to ensure tiles in the area are prioritized.
            this.mapInstance.fitBounds(bounds, { padding: [50, 50], animate: false });
        }
    }
}

// Export for use in app.js
window.MapOptimizer = MapOptimizer;
