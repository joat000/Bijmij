/**
 * Map Optimizer - Improves map loading performance and adds 3D globe view
 */

class MapOptimizer {
    constructor() {
        this.mapInstance = null;
        this.is3DMode = false;
        this.tileCache = new Map();
        this.markerCluster = null;
    }

    /**
     * Initialize optimized 2D map with lazy loading
     */
    initOptimized2DMap(containerId, lat, lng, zoom = 13) {
        if (this.mapInstance) {
            this.mapInstance.setView([lat, lng], zoom);
            return this.mapInstance;
        }

        // Create map with optimized settings
        this.mapInstance = L.map(containerId, {
            preferCanvas: true, // Use canvas for better performance
            zoomControl: true,
            attributionControl: false
        }).setView([lat, lng], zoom);

        // Use faster tile provider with caching
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
            minZoom: 2,
            updateWhenIdle: true, // Only update tiles when map is idle
            updateWhenZooming: false, // Don't update during zoom
            keepBuffer: 2 // Keep tiles in buffer for faster panning
        }).addTo(this.mapInstance);

        return this.mapInstance;
    }

    /**
     * Initialize 3D Globe using Cesium
     */
    async init3DGlobe(containerId, lat, lng) {
        this.is3DMode = true;

        // Load Cesium dynamically
        if (!window.Cesium) {
            await this.loadCesium();
        }

        const container = document.getElementById(containerId);
        container.innerHTML = ''; // Clear existing content

        // Initialize Cesium viewer
        Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5N2UyMjcwOS00MDY1LTQxYjEtYjZjMy00YTU0ZTg1YmJjMmEiLCJpZCI6ODE2MSwic2NvcGVzIjpbImFzciIsImdjIl0sImlhdCI6MTU1Mjk1ODA4Mn0.dkwAL1CcljUV7NA7fDbhXXnmyZQU_c-G5zRx8PtEcxE';

        const viewer = new Cesium.Viewer(containerId, {
            terrainProvider: Cesium.createWorldTerrain(),
            animation: false,
            timeline: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            fullscreenButton: false
        });

        // Fly to location
        viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lng, lat, 15000000),
            duration: 2
        });

        this.mapInstance = viewer;
        return viewer;
    }

    /**
     * Load Cesium library dynamically
     */
    loadCesium() {
        return new Promise((resolve, reject) => {
            // Add CSS
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/cesium@1.111.0/Build/Cesium/Widgets/widgets.css';
            document.head.appendChild(css);

            // Add JS
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/cesium@1.111.0/Build/Cesium/Cesium.js';
            script.onload = resolve;
            script.onerror = (e) => reject(new Error('Failed to load CesiumJS: ' + e.message));
            document.head.appendChild(script);
        });
    }

    /**
     * Add marker with optimized rendering
     */
    addMarker(lat, lng, options = {}) {
        if (this.is3DMode && window.Cesium) {
            // Add 3D pin
            return this.mapInstance.entities.add({
                position: Cesium.Cartesian3.fromDegrees(lng, lat),
                point: {
                    pixelSize: 10,
                    color: options.color || Cesium.Color.RED,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 2
                },
                label: options.label ? {
                    text: options.label,
                    font: '14pt sans-serif',
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    outlineWidth: 2,
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    pixelOffset: new Cesium.Cartesian2(0, -9)
                } : undefined
            });
        } else {
            // Add 2D marker
            const marker = L.marker([lat, lng], options);
            if (options.popup) {
                marker.bindPopup(options.popup);
            }
            return marker.addTo(this.mapInstance);
        }
    }

    /**
     * Toggle between 2D and 3D
     */
    async toggleMode(containerId, lat, lng) {
        this.is3DMode = !this.is3DMode;

        if (this.is3DMode) {
            return await this.init3DGlobe(containerId, lat, lng);
        } else {
            return this.initOptimized2DMap(containerId, lat, lng);
        }
    }

    /**
     * Preload map tiles for faster rendering
     */
    preloadTiles(bounds) {
        if (!this.is3DMode && this.mapInstance) {
            this.mapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    }

    /**
     * Clear all markers
     */
    clearMarkers() {
        if (this.is3DMode && window.Cesium) {
            this.mapInstance.entities.removeAll();
        }
    }
}

// Export for use in app.js
window.MapOptimizer = MapOptimizer;
