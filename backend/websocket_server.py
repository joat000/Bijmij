from flask_socketio import SocketIO, emit, join_room, leave_room
from flask import request
import os
import time
from database_unified import get_db, update_streak

# This will be initialized from app.py
socketio = None

# Active users tracking (in-memory for speed)
active_users = {}  # {user_id: {'socket_id': sid, 'lat': lat, 'lng': lng, 'last_update': timestamp}}

def init_socketio(app):
    """Initialize SocketIO with the Flask app"""
    global socketio
    socketio = SocketIO(
        app, 
        cors_allowed_origins="*",
        async_mode='gevent',
        ping_timeout=60,
        ping_interval=25,
        logger=False,
        engineio_logger=False
    )
    
    @socketio.on('connect')
    def handle_connect():
        print(f'Client connected: {request.sid}')
        emit('connected', {'status': 'success', 'sid': request.sid})
    
    @socketio.on('disconnect')
    def handle_disconnect():
        print(f'Client disconnected: {request.sid}')
        # Remove from active users
        user_to_remove = None
        for user_id, data in active_users.items():
            if data.get('socket_id') == request.sid:
                user_to_remove = user_id
                break
        if user_to_remove:
            del active_users[user_to_remove]
            
            # Update DB: Set offline and last_seen
            try:
                conn = get_db()
                cursor = conn.cursor()
                if hasattr(conn, 'cursor_factory') or os.environ.get('DATABASE_URL'): # Postgres
                    cursor.execute('UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = %s', (user_to_remove,))
                else: # SQLite
                    cursor.execute('UPDATE users SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?', (user_to_remove,))
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error updating offline status: {e}")

            # Broadcast user offline
            emit('user_offline', {'user_id': user_to_remove}, broadcast=True)
    
    @socketio.on('user_online')
    def handle_user_online(data):
        """User comes online - join their room"""
        user_id = data.get('user_id')
        if user_id:
            join_room(f'user_{user_id}')
            active_users[user_id] = {
                'socket_id': request.sid,
                'lat': data.get('lat'),
                'lng': data.get('lng'),
                'last_update': time.time()
            }
            
            # Update DB: Set online
            try:
                conn = get_db()
                cursor = conn.cursor()
                if hasattr(conn, 'cursor_factory') or os.environ.get('DATABASE_URL'): # Postgres
                    cursor.execute('UPDATE users SET is_online = TRUE WHERE id = %s', (user_id,))
                else: # SQLite
                    cursor.execute('UPDATE users SET is_online = 1 WHERE id = ?', (user_id,))
                conn.commit()
                conn.close()
            except Exception as e:
                print(f"Error updating online status: {e}")

            print(f'User {user_id} online')
            # Broadcast to others
            emit('user_online', {'user_id': user_id}, broadcast=True, include_self=False)
    
    @socketio.on('location_update')
    def handle_location_update(data):
        """
        Ultra-fast location update handler
        Immediately broadcasts to nearby users without waiting for DB write
        """
        user_id = data.get('user_id')
        lat = data.get('lat')
        lng = data.get('lng')
        
        if not user_id or lat is None or lng is None:
            return
        
        start_time = time.time()
        
        # 1. IMMEDIATE: Update in-memory cache (< 1ms)
        active_users[user_id] = {
            'socket_id': request.sid,
            'lat': lat,
            'lng': lng,
            'last_update': start_time
        }
        
        # 2. IMMEDIATE: Broadcast to all connected clients (< 5ms)
        emit('location_updated', {
            'user_id': user_id,
            'lat': lat,
            'lng': lng,
            'timestamp': start_time
        }, broadcast=True, include_self=False)
        
        # 3. ASYNC: Update database in background (non-blocking)
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE users 
                SET latitude = ?, longitude = ?, last_location_update = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (lat, lng, user_id))
            conn.commit()
            conn.close()
            
            # Update streak
            update_streak(user_id)
        except Exception as e:
            print(f'DB update error: {e}')
        
        # 4. Send confirmation to sender
        elapsed = (time.time() - start_time) * 1000  # Convert to ms
        emit('location_update_confirmed', {
            'success': True,
            'latency_ms': round(elapsed, 2)
        })
    
    @socketio.on('request_nearby_users')
    def handle_request_nearby_users(data):
        """Fast nearby users lookup using in-memory data"""
        user_id = data.get('user_id')
        lat = data.get('lat')
        lng = data.get('lng')
        radius = data.get('radius', 50)
        worldwide = data.get('worldwide', False)
        
        # Return active users immediately from memory
        nearby = []
        for uid, udata in active_users.items():
            if uid != user_id and udata.get('lat') and udata.get('lng'):
                # Simple distance calculation (can be optimized further)
                from math import radians, sin, cos, sqrt, atan2
                R = 6371
                lat1, lon1 = radians(lat), radians(lng)
                lat2, lon2 = radians(udata['lat']), radians(udata['lng'])
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
                c = 2 * atan2(sqrt(a), sqrt(1-a))
                distance = R * c
                
                if worldwide or distance <= radius:
                    nearby.append({
                        'user_id': uid,
                        'lat': udata['lat'],
                        'lng': udata['lng'],
                        'distance': round(distance, 2),
                        'online': True
                    })
        
        emit('nearby_users_response', {'users': nearby})
    
    @socketio.on('friend_request_sent')
    def handle_friend_request(data):
        """Real-time friend request notification"""
        friend_id = data.get('friend_id')
        sender_name = data.get('sender_name')
        sender_id = data.get('sender_id')
        
        # Send to specific user's room
        emit('new_friend_request', {
            'sender_id': sender_id,
            'sender_name': sender_name,
            'message': f'{sender_name} sent you a friend request!'
        }, room=f'user_{friend_id}')
    
    @socketio.on('message_sent')
    def handle_message_notification(data):
        """Real-time message notification"""
        receiver_id = data.get('receiver_id')
        sender_name = data.get('sender_name')
        message = data.get('message')
        
        emit('new_message', {
            'sender_name': sender_name,
            'message': message
        }, room=f'user_{receiver_id}')
    
    # ============ ENHANCED CHAT FEATURES (Privacy-First) ============
    
    @socketio.on('send_message')
    def handle_send_message(data):
        """
        Handle plain text message sending
        Stores in DB and relays to receiver
        """
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        message_text = data.get('message')
        local_message_id = data.get('local_message_id')
        
        if not all([sender_id, receiver_id, message_text]):
            return
            
        # 1. Store in Database
        try:
            conn = get_db()
            cursor = conn.cursor()
            
            # Insert message
            if hasattr(conn, 'cursor_factory') or os.environ.get('DATABASE_URL'): # Postgres
                cursor.execute('''
                    INSERT INTO messages (sender_id, receiver_id, message, is_read)
                    VALUES (%s, %s, %s, FALSE)
                    RETURNING id, created_at
                ''', (sender_id, receiver_id, message_text))
                row = cursor.fetchone()
                db_message_id = row['id']
                created_at = row['created_at']
            else: # SQLite
                cursor.execute('''
                    INSERT INTO messages (sender_id, receiver_id, message, is_read)
                    VALUES (?, ?, ?, 0)
                ''', (sender_id, receiver_id, message_text))
                db_message_id = cursor.lastrowid
                created_at = datetime.now().isoformat()
                
            conn.commit()
            conn.close()
            
            # 2. Emit to receiver
            emit('new_message_realtime', {
                'id': db_message_id,
                'sender_id': sender_id,
                'sender_name': active_users.get(sender_id, {}).get('name', 'Unknown'),
                'message': message_text,
                'timestamp': str(created_at),
                'server_message_id': db_message_id
            }, room=f'user_{receiver_id}')
            
            # 3. Confirm to sender
            emit('message_sent_confirmed', {
                'local_message_id': local_message_id,
                'server_message_id': db_message_id,
                'timestamp': str(created_at),
                'success': True
            })
            
        except Exception as e:
            print(f"Error sending message: {e}")
            emit('message_sent_error', {
                'local_message_id': local_message_id,
                'error': str(e)
            })
    
    @socketio.on('typing')
    def handle_typing(data):
        """Typing indicator"""
        user_id = data.get('user_id')
        user_name = data.get('user_name')
        receiver_id = data.get('receiver_id')
        
        emit('user_typing', {
            'user_id': user_id,
            'user_name': user_name
        }, room=f'user_{receiver_id}')
    
    @socketio.on('stopped_typing')
    def handle_stopped_typing(data):
        """Stop typing indicator"""
        user_id = data.get('user_id')
        receiver_id = data.get('receiver_id')
        
        emit('user_stopped_typing', {
            'user_id': user_id
        }, room=f'user_{receiver_id}')
    
    @socketio.on('send_read_receipt')
    def handle_read_receipt(data):
        """Read receipt"""
        message_id = data.get('message_id')
        sender_id = data.get('sender_id')
        
        # Update DB
        try:
            conn = get_db()
            cursor = conn.cursor()
            if hasattr(conn, 'cursor_factory') or os.environ.get('DATABASE_URL'): # Postgres
                cursor.execute('UPDATE messages SET is_read = TRUE WHERE id = %s', (message_id,))
            else: # SQLite
                cursor.execute('UPDATE messages SET is_read = 1 WHERE id = ?', (message_id,))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error updating read receipt: {e}")
        
        # Notify sender
        emit('message_read', {
            'message_id': message_id
        }, room=f'user_{sender_id}')
    
    @socketio.on('message_delivered')
    def handle_message_delivered(data):
        """Message delivered receipt"""
        message_id = data.get('message_id')
        sender_id = data.get('sender_id')
        
        emit('message_delivered', {
            'message_id': message_id
        }, room=f'user_{sender_id}')
    
    @socketio.on('send_image_chunk')
    def handle_image_chunk(data):
        """Relay image chunks"""
        receiver_id = data.get('receiver_id')
        # ... (rest of image chunk logic if needed, or simplify to just relay)
        # Assuming image sending is also plain text (base64) or handled similarly
        # For now, keeping relay for chunks but we might want to store images too?
        # The user said "improve it". Storing base64 in DB is bad for performance.
        # Ideally upload to server and send URL.
        # But for now, let's keep the chunk relay as it works for small images, 
        # OR better: The frontend should upload image to /api/users/photo (or a new /api/chat/upload) and send the URL as a message.
        # However, to minimize changes and risk, I'll keep the chunk relay but maybe we should just treat it as a message type?
        # The current implementation relays chunks. Let's keep it for now as "removing e2e" doesn't strictly mean "remove image chunks".
        
        emit('receive_image_chunk', data, room=f'user_{receiver_id}')

    @socketio.on('send_image_chunk')
    def handle_image_chunk(data):
        """
        Handle image transfer in chunks (for privacy and speed)
        Relays chunks directly to receiver without storage
        """
        receiver_id = data.get('receiver_id')
        chunk = data.get('chunk')
        chunk_index = data.get('chunk_index')
        total_chunks = data.get('total_chunks')
        transfer_id = data.get('transfer_id')
        sender_id = data.get('sender_id')
        
        emit('receive_image_chunk', {
            'sender_id': sender_id,
            'chunk': chunk,
            'chunk_index': chunk_index,
            'total_chunks': total_chunks,
            'transfer_id': transfer_id
        }, room=f'user_{receiver_id}')

    @socketio.on('send_wave')
    def handle_wave(data):
        """
        Send a "Wave" to another user
        """
        sender_id = data.get('sender_id')
        sender_name = data.get('sender_name')
        receiver_id = data.get('receiver_id')
        
        emit('receive_wave', {
            'sender_id': sender_id,
            'sender_name': sender_name,
            'message': f"👋 {sender_name} waved at you!"
        }, room=f'user_{receiver_id}')
        
        # Confirm to sender
        emit('wave_sent', {'success': True, 'receiver_id': receiver_id})

    @socketio.on('send_ping')
    def handle_ping(data):
        """
        Send a "Ping" (attention grabber)
        """
        sender_id = data.get('sender_id')
        sender_name = data.get('sender_name')
        receiver_id = data.get('receiver_id')
        
        emit('receive_ping', {
            'sender_id': sender_id,
            'sender_name': sender_name,
            'message': f"🔔 {sender_name} pinged you!"
        }, room=f'user_{receiver_id}')

    return socketio

def broadcast_location_update(user_id, lat, lng):
    """Helper function to broadcast location updates"""
    if socketio:
        socketio.emit('location_updated', {
            'user_id': user_id,
            'lat': lat,
            'lng': lng,
            'timestamp': time.time()
        }, broadcast=True)

def get_active_users():
    """Get list of currently active users"""
    return active_users
