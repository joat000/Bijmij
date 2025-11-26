// Global State
let currentUser = null;
let currentLocation = null;
let currentChatFriendId = null;
let chatPollInterval = null;
let friendsMap = null;
let friendMarkers = [];
let locationManager = null; // Real-time location manager
let userMarkers = {}; // Track markers by user ID for instant updates
let mapOptimizer = null; // Map optimizer for performance and 3D view

// ============ NAVIGATION ============

function showPage(pageId) {
    document.querySelectorAll('.app-page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
}

function goToLanding() {
    showPage('landing-page');
}

function goToUserAuth() {
    showPage('user-auth-page');
}

function goToDashboard() {
    if (!currentUser) {
        goToUserAuth();
        return;
    }
    showPage('user-dashboard');
    updateProfileDisplay();
    loadNotifications();

    // Default to friends section
    switchSection('friends');

    // Try to get location if not set
    if (!currentLocation) {
        enableLocation();
    } else {
        findNearbyFriends();
    }
}

function goToProfile() {
    if (!currentUser) return;
    showPage('profile-page');
    updateProfileDisplay();
}

function switchUserTab(tab) {
    document.querySelectorAll('.auth-tabs-enhanced .auth-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));

    event.target.classList.add('active');
    if (tab === 'login') {
        document.getElementById('user-login-form').classList.add('active');
    } else {
        document.getElementById('user-register-form').classList.add('active');
    }
}

function switchSection(sectionId) {
    // Update sidebar active state
    document.querySelectorAll('.sidebar-nav .menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.onclick.toString().includes(sectionId)) {
            item.classList.add('active');
        }
    });

    // Update content visibility
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`${sectionId}-section`).classList.add('active');

    if (sectionId === 'friends') {
        // Refresh friends view if location exists
        if (currentLocation) findNearbyFriends();
    } else if (sectionId === 'notifications') {
        loadNotifications();
    }
}

// ============ AUTHENTICATION ============

async function handleUserRegister(e) {
    e.preventDefault();
    const name = document.getElementById('user-reg-name').value;
    const email = document.getElementById('user-reg-email').value;
    const password = document.getElementById('user-reg-password').value;
    const photoInput = document.getElementById('user-reg-photo');

    const formData = new FormData();
    formData.append('name', name);
    formData.append('email', email);
    formData.append('password', password);

    if (photoInput.files[0]) {
        formData.append('photo', photoInput.files[0]);
    }

    try {
        const response = await fetch('/api/users/register', {
            method: 'POST',
            body: formData // No Content-Type header needed for FormData
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Account created! Logging you in...', 'success');

            // Auto-login after successful registration
            const loginResponse = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const loginData = await loginResponse.json();

            if (loginResponse.ok) {
                currentUser = loginData.user;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                showToast('Welcome to BijMij!', 'success');
                goToDashboard();
            } else {
                showToast('Registered! Please login manually.', 'success');
                switchUserTab('login');
            }
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Registration failed. Please try again.', 'error');
    }
}

async function handleUserLogin(e) {
    e.preventDefault();
    const email = document.getElementById('user-login-email').value;
    const password = document.getElementById('user-login-password').value;

    try {
        const response = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            currentUser = data.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            showToast('Welcome back!', 'success');
            goToDashboard();
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showToast('Logged out successfully', 'success');
    goToLanding();
}

async function deleteAccount() {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;

    try {
        const response = await fetch(`/api/users/${currentUser.id}/delete`, {
            method: 'DELETE'
        });

        if (response.ok) {
            logout();
            showToast('Account deleted', 'success');
        } else {
            showToast('Failed to delete account', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

// ============ PROFILE & LOCATION ============

function updateProfileDisplay() {
    if (!currentUser) return;

    // Sidebar
    document.getElementById('sidebar-user-name').textContent = currentUser.name;
    const sidebarPhoto = document.getElementById('sidebar-user-photo');
    if (currentUser.profile_photo) {
        sidebarPhoto.innerHTML = `<img src="${currentUser.profile_photo}" class="profile-photo">`;
    } else {
        sidebarPhoto.innerHTML = '👤';
    }

    // Profile Page
    document.getElementById('profile-name').textContent = currentUser.name;
    document.getElementById('profile-email').textContent = currentUser.email;
    const profilePhoto = document.getElementById('profile-photo-display');
    if (currentUser.profile_photo) {
        profilePhoto.innerHTML = `<img src="${currentUser.profile_photo}" class="profile-photo">`;
    } else {
        profilePhoto.innerHTML = '👤';
    }
}

async function handlePhotoUpload(input) {
    if (!input.files || !input.files[0]) return;

    const formData = new FormData();
    formData.append('photo', input.files[0]);

    try {
        const response = await fetch(`/api/users/${currentUser.id}/photo`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            currentUser.profile_photo = data.photo_url;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            updateProfileDisplay();
            showToast('Photo updated!', 'success');
        } else {
            showToast(data.error, 'error');
        }
    } catch (error) {
        showToast('Upload failed', 'error');
    }
}

async function enableLocation() {
    const statusDiv = document.getElementById('location-status');
    statusDiv.textContent = 'Connecting to real-time server...';

    if (!navigator.geolocation) {
        statusDiv.textContent = 'Geolocation not supported';
        return;
    }

    try {
        // Initialize LocationManager if not already done
        if (!locationManager) {
            locationManager = new LocationManager();
        }

        // Connect to WebSocket server
        await locationManager.connect(currentUser.id);
        statusDiv.textContent = 'Starting location tracking...';

        // Start continuous location tracking
        locationManager.startLocationTracking(
            currentUser.id,
            (location) => {
                // Update local state
                currentLocation = location;

                // Update UI immediately (optimistic update)
                statusDiv.textContent = `📍 Location Active (±${Math.round(location.accuracy)}m)`;
                statusDiv.style.color = 'var(--brutalist-green)';

                // Update your marker on map if it exists
                if (friendsMap && userMarkers['self']) {
                    userMarkers['self'].setLatLng([location.lat, location.lng]);
                } else if (friendsMap) {
                    // Create your marker
                    const selfMarker = L.marker([location.lat, location.lng], {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34],
                            shadowSize: [41, 41]
                        })
                    })
                        .addTo(friendsMap)
                        .bindPopup("<b>📍 You are here</b>");

                    userMarkers['self'] = selfMarker;
                    friendsMap.setView([location.lat, location.lng], 13);
                }

                // Refresh nearby friends list
                if (document.getElementById('friends-section').classList.contains('active')) {
                    findNearbyFriends();
                }
            }
        );

        showToast('Real-time location enabled! 🚀', 'success');

    } catch (error) {
        console.error('Location tracking error:', error);
        statusDiv.textContent = 'Location Denied ✗';
        statusDiv.style.color = 'var(--brutalist-red)';
        showToast('Please enable location to find friends', 'warning');

        // Fallback to old method
        enableLocationFallback();
    }
}

// Fallback to old location method if WebSocket fails
function enableLocationFallback() {
    const statusDiv = document.getElementById('location-status');
    statusDiv.textContent = 'Locating...';

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            statusDiv.textContent = 'Location Enabled ✓';

            // Update on server
            if (currentUser) {
                fetch(`/api/users/${currentUser.id}/location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        latitude: currentLocation.lat,
                        longitude: currentLocation.lng
                    })
                });

                // Refresh friends list
                findNearbyFriends();
            }
        },
        (error) => {
            statusDiv.textContent = 'Location Denied ✗';
            showToast('Please enable location to find friends', 'warning');
        }
    );
}

// ============ FRIENDS SYSTEM ============

function switchFriendsTab(tabName) {
    // Update tabs
    document.querySelectorAll('.auth-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(tabName) ||
            (tabName === 'list' && btn.textContent.includes('My Friends'))) {
            btn.classList.add('active');
        }
    });

    // Update views
    document.querySelectorAll('.friends-view').forEach(view => {
        view.classList.remove('active');
    });

    document.getElementById(`friends-${tabName}-view`).classList.add('active');

    // Load content based on tab
    if (tabName === 'requests') loadFriendRequests();
    if (tabName === 'list') loadFriendsList();
    if (tabName === 'chat') loadChatFriends();
}

// ============ RADIUS CONTROL ============

function updateRadiusDisplay(value) {
    document.getElementById('radius-value').textContent = value;
    const modeText = document.getElementById('search-mode-text');
    modeText.textContent = `Find users within ${value}km of your location`;
}

async function findNearbyFriends(worldwide = false) {
    if (!currentLocation) {
        // Try to get location again
        showToast('Please enable location first!', 'warning');
        enableLocation();
        return;
    }

    const grid = document.getElementById('nearby-friends-grid');
    const mapContainer = document.getElementById('friends-map');
    const modeText = document.getElementById('search-mode-text');

    // Update search mode text
    if (worldwide) {
        grid.innerHTML = '<div class="loading">🌍 Searching worldwide...</div>';
        modeText.textContent = '🌍 Showing ALL users worldwide';
        modeText.style.color = 'var(--brutalist-green)';
        modeText.style.fontWeight = 'bold';
    } else {
        grid.innerHTML = '<div class="loading">📍 Searching nearby...</div>';
        modeText.textContent = 'Find users within 50km of your location';
        modeText.style.color = 'var(--text-secondary)';
        modeText.style.fontWeight = 'normal';
    }

    mapContainer.style.display = 'block';

    // Initialize map optimizer if not exists
    if (!mapOptimizer) {
        mapOptimizer = new MapOptimizer();
    }

    // Initialize map with appropriate zoom
    const initialZoom = worldwide ? 2 : 13;

    if (!friendsMap) {
        friendsMap = mapOptimizer.initOptimized2DMap('friends-map', currentLocation.lat, currentLocation.lng, initialZoom);

        // Add your location marker
        mapOptimizer.addMarker(currentLocation.lat, currentLocation.lng, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }),
            popup: "<b>📍 You are here</b>"
        }).openPopup();
    } else {
        friendsMap.setView([currentLocation.lat, currentLocation.lng], initialZoom);
    }

    // Clear previous markers
    friendMarkers.forEach(marker => friendsMap.removeLayer(marker));
    friendMarkers = [];

    try {
        // Get selected radius from slider (or default to 50)
        const selectedRadius = worldwide ? 999999 : (parseInt(document.getElementById('radius-slider')?.value) || 50);

        const response = await fetch('/api/friends/nearby', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                latitude: currentLocation.lat,
                longitude: currentLocation.lng,
                radius: selectedRadius,
                worldwide: worldwide
            })
        });

        const users = await response.json();
        grid.innerHTML = '';

        if (users.length === 0) {
            grid.innerHTML = `<p class="empty-state">${worldwide ? '🌍 No other users found worldwide yet. Be the first!' : '📍 No users found nearby. Try Worldwide mode!'}</p>`;
            return;
        }

        // Show count
        const countText = worldwide ? `Found ${users.length} users worldwide!` : `Found ${users.length} users nearby`;
        grid.innerHTML = `<p style="text-align:center; font-weight:bold; margin-bottom:20px; color:var(--brutalist-green);">${countText}</p>`;

        // Store all marker positions for auto-fit
        const markerBounds = [];

        // Add your position to bounds
        markerBounds.push([currentLocation.lat, currentLocation.lng]);

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'business-card';

            let actionBtn = '';
            let mapActionBtn = '';

            if (user.friend_status === 'accepted') {
                actionBtn = `<button class="book-btn" onclick="switchFriendsTab('chat'); startChat(${user.id}, '${user.name}')">💬 CHAT</button>`;
                mapActionBtn = `<button onclick="switchFriendsTab('chat'); startChat(${user.id}, '${user.name}')" style="background:var(--brutalist-green); color:white; border:2px solid black; padding:5px 10px; cursor:pointer; margin-top:5px; font-weight:bold;">💬 CHAT</button>`;
            } else if (user.friend_status === 'pending') {
                actionBtn = `<button class="book-btn" disabled>🕒 PENDING</button>`;
                mapActionBtn = `<button disabled style="background:gray; color:white; border:2px solid black; padding:5px 10px; margin-top:5px;">🕒 PENDING</button>`;
            } else {
                actionBtn = `<button class="book-btn" onclick="sendFriendRequest(${user.id})">➕ ADD FRIEND</button>`;
                mapActionBtn = `<button onclick="sendFriendRequest(${user.id})" style="background:black; color:white; border:2px solid black; padding:5px 10px; cursor:pointer; margin-top:5px; font-weight:bold;">➕ ADD FRIEND</button>`;
            }

            // Distance display with flag for worldwide and location status
            let distanceDisplay;
            if (!user.has_location || user.distance === 0) {
                distanceDisplay = '📍 Location not shared yet';
            } else if (worldwide && user.distance > 100) {
                distanceDisplay = `🌍 ${Math.round(user.distance)} km away`;
            } else {
                distanceDisplay = `📍 ${user.distance} km away`;
            }

            card.innerHTML = `
                <div class="profile-photo-container" style="width: 80px; height: 80px; border-width: 3px;">
                    ${user.profile_photo ?
                    `<img src="${user.profile_photo}" class="profile-photo">` :
                    `<div class="profile-photo">👤</div>`
                }
                </div>
                <h3 class="business-name" style="text-align: center; font-size: 1.2rem;">${user.name}</h3>
                <p class="business-distance" style="text-align: center; font-weight: bold;">${distanceDisplay}</p>
                <div style="margin-top: 15px;">
                    ${actionBtn}
                </div>
            `;
            grid.appendChild(card);

            // Only add map marker if user has location
            if (user.latitude && user.longitude && user.has_location) {
                // Add to bounds
                markerBounds.push([user.latitude, user.longitude]);

                // Create marker
                const marker = L.marker([user.latitude, user.longitude])
                    .addTo(friendsMap)
                    .bindPopup(`
                        <div style="text-align:center; font-family:'Courier New', monospace;">
                            <b>${user.name}</b><br>
                            <span style="color: ${worldwide && user.distance > 100 ? 'green' : 'black'}; font-weight: bold;">${distanceDisplay}</span><br>
                            ${mapActionBtn}
                        </div>
                    `);
                friendMarkers.push(marker);
            }
        });

        // Auto-fit map to show all markers (especially for worldwide)
        if (worldwide && markerBounds.length > 1) {
            const bounds = L.latLngBounds(markerBounds);
            friendsMap.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 15 // Don't zoom in too much
            });
        }

    } catch (error) {
        console.error('Error finding friends:', error);
        grid.innerHTML = '<p class="empty-state">⚠️ Error loading users. Please try again.</p>';
        showToast('Failed to find friends', 'error');
    }
}

async function sendFriendRequest(friendId) {
    try {
        const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                friend_id: friendId
            })
        });

        if (response.ok) {
            showToast('Friend request sent!', 'success');
            findNearbyFriends();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to send request', 'error');
        }
    } catch (error) {
        showToast('Network error', 'error');
    }
}

async function loadFriendRequests() {
    const container = document.getElementById('friend-requests-list');

    try {
        const response = await fetch(`/api/friends/requests/${currentUser.id}`);
        const requests = await response.json();

        container.innerHTML = '';

        if (requests.length === 0) {
            container.innerHTML = '<p class="empty-state">No pending requests</p>';
            return;
        }

        requests.forEach(req => {
            const card = document.createElement('div');
            card.className = 'friend-request-card';
            card.innerHTML = `
                <div class="request-info">
                    <div class="profile-photo-container" style="width: 50px; height: 50px; margin: 0; border-width: 2px;">
                        ${req.profile_photo ?
                    `<img src="${req.profile_photo}" class="profile-photo">` :
                    `<div class="profile-photo" style="font-size: 1.5rem;">👤</div>`
                }
                    </div>
                    <div>
                        <h4 style="margin: 0; font-weight: 900;">${req.name}</h4>
                        <span style="font-size: 0.8rem; opacity: 0.7;">Sent you a request</span>
                    </div>
                </div>
                <div class="request-actions">
                    <button class="accept-btn" onclick="acceptFriendRequest(${req.id})">ACCEPT</button>
                </div>
            `;
            container.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading requests:', error);
        showToast('Failed to load friend requests', 'error');
    }
}

async function acceptFriendRequest(friendId) {
    console.log('Accepting friend request from ID:', friendId);

    try {
        const response = await fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                friend_id: friendId
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Friend request accepted!', 'success');
            loadFriendRequests();
            // Refresh nearby friends to update status
            findNearbyFriends();
        } else {
            showToast(data.error || 'Failed to accept request', 'error');
        }
    } catch (error) {
        console.error('Error accepting request:', error);
        showToast('Failed to accept request', 'error');
    }
}

async function loadFriendsList() {
    const grid = document.getElementById('my-friends-grid');

    try {
        const response = await fetch(`/api/friends/list/${currentUser.id}`);
        const friends = await response.json();

        grid.innerHTML = '';

        if (friends.length === 0) {
            grid.innerHTML = '<p class="empty-state">No friends yet. Find some nearby!</p>';
            return;
        }

        friends.forEach(friend => {
            const card = document.createElement('div');
            card.className = 'business-card';
            card.innerHTML = `
                <div class="profile-photo-container" style="width: 80px; height: 80px; border-width: 3px;">
                    ${friend.profile_photo ?
                    `<img src="${friend.profile_photo}" class="profile-photo">` :
                    `<div class="profile-photo">👤</div>`
                }
                </div>
                <h3 class="business-name" style="text-align: center;">${friend.name}</h3>
                <div style="margin-top: 15px;">
                    <button class="book-btn" onclick="switchFriendsTab('chat'); startChat(${friend.id}, '${friend.name}')">💬 CHAT</button>
                </div>
            `;
            grid.appendChild(card);
        });

    } catch (error) {
        console.error('Error loading friends:', error);
    }
}

// ============ CHAT SYSTEM ============

async function loadChatFriends() {
    const list = document.getElementById('chat-friends-list');

    try {
        const response = await fetch(`/api/friends/list/${currentUser.id}`);
        const friends = await response.json();

        list.innerHTML = '';

        friends.forEach(friend => {
            const item = document.createElement('div');
            item.className = 'chat-list-item';
            if (currentChatFriendId === friend.id) item.classList.add('active');

            item.onclick = () => startChat(friend.id, friend.name);

            item.innerHTML = `
                <div class="profile-photo-container" style="width: 40px; height: 40px; margin: 0; border-width: 2px;">
                    ${friend.profile_photo ?
                    `<img src="${friend.profile_photo}" class="profile-photo">` :
                    `<div class="profile-photo" style="font-size: 1.2rem;">👤</div>`
                }
                </div>
                <span style="font-weight: bold;">${friend.name}</span>
            `;
            list.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading chat list:', error);
    }
}

function startChat(friendId, friendName) {
    currentChatFriendId = friendId;
    document.getElementById('chat-with-name').textContent = friendName;
    document.getElementById('chat-input').disabled = false;
    document.getElementById('send-msg-btn').disabled = false;

    document.querySelectorAll('.chat-list-item').forEach(item => {
        item.classList.remove('active');
        if (item.textContent.includes(friendName)) item.classList.add('active');
    });

    loadMessages();

    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(loadMessages, 3000);
}

async function loadMessages() {
    if (!currentChatFriendId) return;

    const container = document.getElementById('chat-messages');

    try {
        const response = await fetch('/api/messages/conversation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                friend_id: currentChatFriendId
            })
        });

        const messages = await response.json();

        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = '<div class="empty-chat-state">No messages yet. Say hi! 👋</div>';
            return;
        }

        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`;
            div.innerHTML = `
                ${msg.message}
                <div class="message-time">${new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            `;
            container.appendChild(div);
        });

        container.scrollTop = container.scrollHeight;

    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message || !currentChatFriendId) return;

    try {
        const response = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sender_id: currentUser.id,
                receiver_id: currentChatFriendId,
                message: message
            })
        });

        if (response.ok) {
            input.value = '';
            loadMessages();
        }
    } catch (error) {
        showToast('Failed to send message', 'error');
    }
}

// ============ NOTIFICATIONS ============

async function loadNotifications() {
    const container = document.getElementById('notifications-list');
    const badge = document.getElementById('notification-count');

    try {
        const response = await fetch(`/api/notifications/${currentUser.id}`);
        const notifications = await response.json();

        const unreadCount = notifications.filter(n => !n.is_read).length;
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';

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
                // Mark as read when rendered (simple approach)
                fetch(`/api/notifications/mark-read/${notif.id}`, { method: 'POST' });
            }

            container.appendChild(div);
        });

    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// ============ UTILS ============

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function toggleDarkMode() {
    const body = document.body;
    const button = document.getElementById('dark-mode-toggle');

    body.classList.toggle('dark-mode');

    if (body.classList.contains('dark-mode')) {
        button.textContent = '☀️ LIGHT MODE';
        localStorage.setItem('darkMode', 'enabled');
    } else {
        button.textContent = '🌙 DARK MODE';
        localStorage.setItem('darkMode', 'disabled');
    }
}

function loadDarkModePreference() {
    const darkMode = localStorage.getItem('darkMode');
    const button = document.getElementById('dark-mode-toggle');

    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        if (button) {
            button.textContent = '☀️ LIGHT MODE';
        }
    }
}

// ============ REAL-TIME UPDATES ============

/**
 * Update user marker on map in real-time
 */
window.updateUserMarker = function (userId, lat, lng) {
    if (!friendsMap) return;

    // Check if marker exists
    if (userMarkers[userId]) {
        // Update existing marker position
        userMarkers[userId].setLatLng([lat, lng]);
    } else {
        // Create new marker
        const marker = L.marker([lat, lng])
            .addTo(friendsMap)
            .bindPopup(`<b>User ${userId}</b><br>📍 Live location`);

        userMarkers[userId] = marker;
        friendMarkers.push(marker);
    }
};

/**
 * Update user card distance in real-time
 */
window.updateUserCard = function (userId, lat, lng) {
    if (!currentLocation) return;

    // Calculate new distance
    const distance = calculateDistanceClient(
        currentLocation.lat,
        currentLocation.lng,
        lat,
        lng
    );

    // Update card if visible
    const cards = document.querySelectorAll('.business-card');
    cards.forEach(card => {
        if (card.dataset.userId == userId) {
            const distanceEl = card.querySelector('.business-distance');
            if (distanceEl) {
                distanceEl.textContent = `📍 ${distance.toFixed(2)} km away`;
            }
        }
    });
};

/**
 * Calculate distance on client side (Haversine formula)
 */
function calculateDistanceClient(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Show latency indicator (for performance monitoring)
 */
window.showLatencyIndicator = function (latencyMs) {
    const indicator = document.getElementById('latency-indicator');
    if (!indicator) return;

    indicator.textContent = `⚡ ${latencyMs}ms`;
    indicator.style.display = 'block';

    // Color code based on latency
    if (latencyMs < 100) {
        indicator.style.color = 'var(--brutalist-green)';
    } else if (latencyMs < 300) {
        indicator.style.color = 'orange';
    } else {
        indicator.style.color = 'red';
    }

    // Hide after 2 seconds
    setTimeout(() => {
        indicator.style.display = 'none';
    }, 2000);
};

/**
 * Handle user coming online
 */
window.onUserOnline = function (userId) {
    console.log(`User ${userId} is now online`);
    // Refresh nearby users if on friends tab
    if (document.getElementById('friends-section')?.classList.contains('active')) {
        findNearbyFriends();
    }
};

/**
 * Handle user going offline
 */
window.onUserOffline = function (userId) {
    console.log(`User ${userId} went offline`);
    // Remove marker if exists
    if (userMarkers[userId]) {
        friendsMap.removeLayer(userMarkers[userId]);
        delete userMarkers[userId];
    }
};

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
    loadDarkModePreference();

    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        goToDashboard();
    }

    // Chat enter key
    document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});
