// Business Dashboard JavaScript

let currentBusiness = null;
let businessMap = null;

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    const savedBusiness = localStorage.getItem('currentBusiness');

    if (!savedBusiness) {
        window.location.href = '/';
        return;
    }

    currentBusiness = JSON.parse(savedBusiness);
    initializeDashboard();
});

async function initializeDashboard() {
    // Update header
    document.getElementById('business-name').textContent = currentBusiness.business_name;
    document.getElementById('business-type').textContent = currentBusiness.business_type;
    document.getElementById('business-address').textContent = currentBusiness.address;
    document.getElementById('business-coords').textContent =
        `${currentBusiness.latitude.toFixed(4)}, ${currentBusiness.longitude.toFixed(4)}`;

    // Initialize map
    initBusinessMap();

    // Load dashboard data
    await loadDashboardStats();
    await loadRecentBookings();
    await loadServices();
    await loadBusinessNotifications();
}

// ============ MAP ============
function initBusinessMap() {
    if (!currentBusiness.latitude || !currentBusiness.longitude) return;

    businessMap = L.map('business-map').setView(
        [currentBusiness.latitude, currentBusiness.longitude],
        15
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(businessMap);

    // Add business marker
    L.marker([currentBusiness.latitude, currentBusiness.longitude], {
        icon: L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        })
    }).addTo(businessMap).bindPopup(`
        <strong>${currentBusiness.business_name}</strong><br>
        ${currentBusiness.business_type}<br>
        ${currentBusiness.address}
    `).openPopup();

    // Add circle to show service area
    L.circle([currentBusiness.latitude, currentBusiness.longitude], {
        color: '#8B5CF6',
        fillColor: '#8B5CF6',
        fillOpacity: 0.1,
        radius: 5000 // 5km radius
    }).addTo(businessMap);
}

// ============ DASHBOARD STATS ============
async function loadDashboardStats() {
    try {
        const response = await fetch(`/api/business/${currentBusiness.id}/stats`);

        if (response.ok) {
            const stats = await response.json();

            document.getElementById('total-bookings').textContent = stats.total_bookings || 0;
            document.getElementById('pending-bookings').textContent = stats.pending_bookings || 0;
            document.getElementById('confirmed-bookings').textContent = stats.confirmed_bookings || 0;
            document.getElementById('total-revenue').textContent = `$${stats.total_revenue || 0}`;
        } else {
            // Use mock data if endpoint doesn't exist yet
            document.getElementById('total-bookings').textContent = '0';
            document.getElementById('pending-bookings').textContent = '0';
            document.getElementById('confirmed-bookings').textContent = '0';
            document.getElementById('total-revenue').textContent = '$0';
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// ============ BOOKINGS ============
async function loadRecentBookings() {
    try {
        const response = await fetch(`/api/business/${currentBusiness.id}/bookings`);

        if (response.ok) {
            const bookings = await response.json();
            displayBookings(bookings);
        } else {
            // Show empty state
            document.getElementById('bookings-list').innerHTML = `
                <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No bookings yet
                </p>
            `;
        }
    } catch (error) {
        console.error('Error loading bookings:', error);
        document.getElementById('bookings-list').innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                No bookings yet
            </p>
        `;
    }
}

function displayBookings(bookings) {
    const container = document.getElementById('bookings-list');

    if (bookings.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                No bookings yet
            </p>
        `;
        return;
    }

    container.innerHTML = bookings.map(booking => `
        <div class="booking-list-item">
            <div class="booking-customer">${booking.user_name || 'Customer'}</div>
            <div class="booking-details">
                ${booking.service_name} - $${booking.service_price}<br>
                📅 ${new Date(booking.booking_date).toLocaleDateString()} at ${booking.booking_time}
            </div>
            <span class="booking-status ${booking.status}">${booking.status}</span>
        </div>
    `).join('');
}

// ============ SERVICES ============
async function loadServices() {
    try {
        const response = await fetch(`/api/business/${currentBusiness.id}/services`);

        if (response.ok) {
            const services = await response.json();
            displayServices(services);
        } else {
            document.getElementById('services-list').innerHTML = `
                <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                    No services added yet
                </p>
            `;
        }
    } catch (error) {
        console.error('Error loading services:', error);
    }
}

function displayServices(services) {
    const container = document.getElementById('services-list');

    if (services.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                No services added yet
            </p>
        `;
        return;
    }

    container.innerHTML = services.map(service => `
        <div style="background: var(--glass); padding: 12px; border-radius: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${service.service_name}</strong>
            </div>
            <div style="color: var(--primary-teal); font-weight: bold;">
                $${service.price}
            </div>
        </div>
    `).join('');
}

function addService() {
    const serviceName = prompt('Enter service name:');
    if (!serviceName) return;

    const servicePrice = prompt('Enter service price:');
    if (!servicePrice) return;

    // TODO: Implement API call to add service
    showToast('Service management coming soon!', 'info');
}

// ============ NOTIFICATIONS ============
async function loadBusinessNotifications() {
    try {
        const response = await fetch(`/api/business/${currentBusiness.id}/notifications`);

        if (response.ok) {
            const notifications = await response.json();
            displayNotifications(notifications);
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function displayNotifications(notifications) {
    const container = document.getElementById('business-notifications');

    if (notifications.length === 0) {
        container.innerHTML = `
            <p style="text-align: center; color: var(--text-muted); padding: 40px;">
                No notifications
            </p>
        `;
        return;
    }

    container.innerHTML = notifications.map(notif => `
        <div style="background: var(--glass); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
            <div style="font-weight: bold; margin-bottom: 5px;">${notif.title}</div>
            <div style="color: var(--text-muted); font-size: 0.9rem;">${notif.message}</div>
            <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 5px;">
                ${new Date(notif.created_at).toLocaleString()}
            </div>
        </div>
    `).join('');
}

// ============ LOGOUT ============
function logoutBusiness() {
    localStorage.removeItem('currentBusiness');
    showToast('Logged out successfully', 'success');
    setTimeout(() => {
        window.location.href = '/';
    }, 1000);
}

// ============ TOAST ============
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}
