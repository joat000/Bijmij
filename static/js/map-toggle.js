// Add 3D Globe toggle function
async function toggle3DMap() {
    if (!currentLocation || !mapOptimizer) {
        showToast('Please enable location first!', 'warning');
        return;
    }

    const toggleBtn = document.getElementById('map-3d-toggle');

    try {
        toggleBtn.textContent = '⏳ Loading...';
        toggleBtn.disabled = true;

        await mapOptimizer.toggleMode('friends-map', currentLocation.lat, currentLocation.lng);

        if (mapOptimizer.is3DMode) {
            toggleBtn.textContent = '🗺️ 2D Map';
            showToast('3D Globe activated! 🌐', 'success');
        } else {
            toggleBtn.textContent = '🌐 3D Globe';
            showToast('2D Map activated! 🗺️', 'success');
        }

        // Reload markers
        findNearbyFriends();

    } catch (error) {
        console.error('Failed to toggle map mode:', error);
        showToast('Failed to load 3D globe', 'error');
        toggleBtn.textContent = '🌐 3D Globe';
    } finally {
        toggleBtn.disabled = false;
    }
}
