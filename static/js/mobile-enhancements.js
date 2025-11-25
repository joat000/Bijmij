/* ============================================
   MOBILE MENU & NOTIFICATION FUNCTIONS
   Add this to the END of app.js
   ============================================ */

// ============ MOBILE MENU ============

function toggleMobileMenu() {
    const menu = document.getElementById('mobile-menu');
    const overlay = document.getElementById('mobile-menu-overlay');

    menu.classList.toggle('active');
    overlay.classList.toggle('active');

    // Update mobile menu user info when opening
    if (menu.classList.contains('active') && currentUser) {
        document.getElementById('mobile-user-name').textContent = currentUser.name;
        document.getElementById('mobile-user-email').textContent = currentUser.email;

        const mobilePhoto = document.getElementById('mobile-user-photo');
        if (currentUser.profile_photo) {
            mobilePhoto.innerHTML = `<img src="${currentUser.profile_photo}" class="profile-photo">`;
        } else {
            mobilePhoto.innerHTML = '👤';
        }
    }
}

// Update mobile notification count
function updateMobileNotificationCount(count) {
    const badge = document.getElementById('mobile-notification-count');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
}

// ============ NOTIFICATION SOUND & BROWSER NOTIFICATIONS ============

// Request notification permission on page load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Play notification sound
function playNotificationSound() {
    const audio = document.getElementById('notification-sound');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => console.log('Audio play failed:', err));
    }
}

// Show browser notification
function showBrowserNotification(title, body, icon = '🔔') {
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification(title, {
            body: body,
            icon: icon,
            badge: icon,
            tag: 'bijmij-notification',
            requireInteraction: false
        });

        notification.onclick = function () {
            window.focus();
            notification.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
    }
}

// Enhanced showToast with sound and browser notification
const originalShowToast = window.showToast;
window.showToast = function (message, type = 'success') {
    // Call original toast
    if (originalShowToast) {
        originalShowToast(message, type);
    } else {
        // Fallback if original doesn't exist
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `toast ${type} show`;
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }

    // Play sound for important notifications
    if (type === 'success' || type === 'warning') {
        playNotificationSound();
    }

    // Show browser notification for important messages
    if (type === 'success' && (message.includes('request') || message.includes('message') || message.includes('friend'))) {
        showBrowserNotification('BijMij', message);
    }
};

// Enhanced notification loading with sound
const originalLoadNotifications = window.loadNotifications;
window.loadNotifications = async function () {
    const container = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-count');

    try {
        const response = await fetch(`/api/notifications/${currentUser.id}`);
        const notifications = await response.json();

        const unreadCount = notifications.filter(n => !n.is_read).length;
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';

        // Update mobile badge
        updateMobileNotificationCount(unreadCount);

        // Play sound if there are new unread notifications
        if (unreadCount > 0 && !window.lastUnreadCount) {
            playNotificationSound();
        }
        window.lastUnreadCount = unreadCount;

        container.innerHTML = '';

        if (notifications.length === 0) {
            container.innerHTML = '<p class="empty-state">No notifications yet</p>';
            return;
        }

        notifications.forEach(notif => {
            const div = document.createElement('div');
            div.className = `notification-item ${notif.is_read ? 'read' : 'unread'}`;
            div.innerHTML = `
                <div class="notif-content">
                    <p>${notif.message}</p>
                    <span class="notif-time">${new Date(notif.created_at).toLocaleDateString()}</span>
                </div>
            `;

            if (!notif.is_read) {
                // Mark as read when rendered
                fetch(`/api/notifications/mark-read/${notif.id}`, { method: 'POST' });

                // Show browser notification for unread
                showBrowserNotification('New Notification', notif.message);
            }

            container.appendChild(div);
        });

    } catch (error) {
        console.error('Error loading notifications:', error);
    }
};

// Poll for new notifications every 10 seconds
setInterval(() => {
    if (currentUser && document.getElementById('user-dashboard').classList.contains('active')) {
        loadNotifications();
    }
}, 10000);

console.log('✅ Mobile menu and notification enhancements loaded!');
