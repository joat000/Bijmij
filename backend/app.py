from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import hashlib
import os
import sys
from datetime import datetime
import math
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='../static')
CORS(app)

# Initialize WebSocket support
try:
    from backend.websocket_server import init_socketio
except ImportError:
    from websocket_server import init_socketio
    
socketio = init_socketio(app)

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads')
ALLOWED_EXTENSIONS_IMAGES = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Ensure upload directories exist
os.makedirs(os.path.join(UPLOAD_FOLDER, 'users'), exist_ok=True)

# Import unified database module (supports both SQLite and PostgreSQL)
try:
    from backend.database_unified import get_db, USE_POSTGRES, IntegrityError
except ImportError:
    from database_unified import get_db, USE_POSTGRES, IntegrityError

if USE_POSTGRES:
    print("🐘 Using PostgreSQL (Production)")
else:
    print("🔧 Using SQLite (Development)")

# Initialize database
try:
    from backend.database_unified import init_db
except ImportError:
    try:
        from database_unified import init_db
    except ImportError:
        def init_db():
            pass

# Initialize database tables on startup
init_db()


def hash_password(password):
    """Hash password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS_IMAGES

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in km using Haversine formula"""
    if not lat1 or not lon1 or not lat2 or not lon2:
        return 9999
        
    R = 6371  # Earth radius in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    d = R * c
    return d

# ============ ROUTES ============

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/admin/download-db-secret-key-123')
def download_db():
    """Temporary route to download live database"""
    try:
        db_path = os.path.join(os.path.dirname(__file__), '..', 'database.db')
        return send_from_directory(os.path.dirname(db_path), 'database.db', as_attachment=True)
    except Exception as e:
        return str(e)

# ============ USER AUTH ============

@app.route('/api/users/register', methods=['POST'])
def register_user():
    try:
        # Handle both JSON and Form Data
        if request.is_json:
            data = request.get_json()
            name = data.get('name')
            email = data.get('email')
            password = data.get('password')
            photo = None
        else:
            name = request.form.get('name')
            email = request.form.get('email')
            password = request.form.get('password')
            photo = request.files.get('photo')
        
        if not name or not email or not password:
            return jsonify({'error': 'Missing required fields'}), 400
            
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Handle photo upload
            photo_url = None
            if photo and allowed_file(photo.filename):
                filename = secure_filename(f"user_reg_{int(datetime.now().timestamp())}.jpg")
                filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'users', filename)
                photo.save(filepath)
                photo_url = f"/uploads/users/{filename}"

            try:
                cursor.execute('''
                    INSERT INTO users (name, email, password_hash, profile_photo)
                    VALUES (?, ?, ?, ?)
                ''', (name, email, hash_password(password), photo_url))
                conn.commit()
                user_id = cursor.lastrowid
            except IntegrityError:
                return jsonify({'error': 'Email already registered'}), 409
                
            return jsonify({'message': 'Registration successful', 'user_id': user_id}), 201
        finally:
            conn.close()
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/login', methods=['POST'])
def login_user():
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM users WHERE email = ? AND password_hash = ?
            ''', (email, hash_password(password)))
            
            user = cursor.fetchone()
        finally:
            conn.close()
        
        if user:
            return jsonify({
                'message': 'Login successful',
                'user': {
                    'id': user['id'],
                    'name': user['name'],
                    'email': user['email'],
                    'profile_photo': user['profile_photo']
                }
            }), 200
        else:
            return jsonify({'error': 'Invalid credentials'}), 401
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user_profile(user_id):
    try:
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('SELECT id, name, email, profile_photo, latitude, longitude FROM users WHERE id = ?', (user_id,))
            user = cursor.fetchone()
        finally:
            conn.close()
        
        if user:
            return jsonify(dict(user)), 200
        else:
            return jsonify({'error': 'User not found'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/location', methods=['POST'])
def update_user_location(user_id):
    try:
        data = request.get_json()
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                UPDATE users 
                SET latitude = ?, longitude = ?
                WHERE id = ?
            ''', (latitude, longitude, user_id))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({'message': 'Location updated'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500




@app.route('/api/users/<int:user_id>/photo', methods=['POST'])
def upload_user_photo(user_id):
    try:
        if 'photo' not in request.files:
            return jsonify({'error': 'No file part'}), 400
            
        file = request.files['photo']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
            
        if file and allowed_file(file.filename):
            filename = secure_filename(f"user_{user_id}_{int(datetime.now().timestamp())}.jpg")
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], 'users', filename)
            file.save(filepath)
            
            photo_url = f"/uploads/users/{filename}"
            
            conn = get_db()
            try:
                cursor = conn.cursor()
                cursor.execute('UPDATE users SET profile_photo = ? WHERE id = ?', (photo_url, user_id))
                conn.commit()
            finally:
                conn.close()
            
            return jsonify({'message': 'Photo uploaded', 'photo_url': photo_url}), 200
            
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/delete', methods=['DELETE'])
def delete_user(user_id):
    try:
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Delete related data
            cursor.execute('DELETE FROM friends WHERE user_id = ? OR friend_id = ?', (user_id, user_id))
            cursor.execute('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?', (user_id, user_id))
            cursor.execute('DELETE FROM notifications WHERE user_id = ?', (user_id,))
            cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({'message': 'Account deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ FRIENDS SYSTEM ============

@app.route('/api/friends/nearby', methods=['POST'])
def get_nearby_users():
    """Get nearby users for friend suggestions (supports worldwide search)"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        radius = data.get('radius', 50)  # 50km default, or 999999 for worldwide
        worldwide = data.get('worldwide', False)  # New worldwide flag
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Get all users except current user
            # Include users even if they haven't shared location yet
            cursor.execute('''
                SELECT id, name, email, latitude, longitude, profile_photo
                FROM users
                WHERE id != ?
            ''', (user_id,))
            
            users = cursor.fetchall()
            nearby_users = []
            
            for user in users:
                # Calculate distance only if both users have location
                if user['latitude'] and user['longitude'] and latitude and longitude:
                    distance = calculate_distance(
                        latitude, longitude,
                        user['latitude'], user['longitude']
                    )
                    
                    # Include user if within radius OR if worldwide search
                    if worldwide or distance <= radius:
                        # Check if already friends or request pending
                        cursor.execute('''
                            SELECT status FROM friends
                            WHERE (user_id = ? AND friend_id = ?)
                               OR (user_id = ? AND friend_id = ?)
                        ''', (user_id, user['id'], user['id'], user_id))
                        
                        friendship = cursor.fetchone()
                        friend_status = friendship['status'] if friendship else None
                        
                        nearby_users.append({
                            'id': user['id'],
                            'name': user['name'],
                            'email': user['email'],
                            'distance': round(distance, 2),
                            'profile_photo': user['profile_photo'],
                            'friend_status': friend_status,
                            'latitude': user['latitude'],
                            'longitude': user['longitude'],
                            'has_location': True
                        })
                else:
                    # User hasn't shared location yet - show them anyway in worldwide mode
                    if worldwide:
                        cursor.execute('''
                            SELECT status FROM friends
                            WHERE (user_id = ? AND friend_id = ?)
                               OR (user_id = ? AND friend_id = ?)
                        ''', (user_id, user['id'], user['id'], user_id))
                        
                        friendship = cursor.fetchone()
                        friend_status = friendship['status'] if friendship else None
                        
                        nearby_users.append({
                            'id': user['id'],
                            'name': user['name'],
                            'email': user['email'],
                            'distance': 0,  # Unknown distance
                            'profile_photo': user['profile_photo'],
                            'friend_status': friend_status,
                            'latitude': user['latitude'],
                            'longitude': user['longitude'],
                            'has_location': False
                        })
            
            # Sort by distance
            nearby_users.sort(key=lambda x: x['distance'])
        finally:
            conn.close()
        return jsonify(nearby_users), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/friends/request', methods=['POST'])
def send_friend_request():
    """Send a friend request"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        friend_id = data.get('friend_id')
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Check if request already exists
            cursor.execute('''
                SELECT * FROM friends
                WHERE (user_id = ? AND friend_id = ?)
                   OR (user_id = ? AND friend_id = ?)
            ''', (user_id, friend_id, friend_id, user_id))
            
            existing = cursor.fetchone()
            if existing:
                return jsonify({'error': 'Friend request already exists'}), 400
            
            # Create friend request
            cursor.execute('''
                INSERT INTO friends (user_id, friend_id, status)
                VALUES (?, ?, 'pending')
            ''', (user_id, friend_id))
            
            # Create notification for friend
            cursor.execute('''
                SELECT name FROM users WHERE id = ?
            ''', (user_id,))
            sender = cursor.fetchone()
            
            cursor.execute('''
                INSERT INTO notifications (user_id, message, type)
                VALUES (?, ?, 'friend_request')
            ''', (friend_id, f"{sender['name']} sent you a friend request!"))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({'message': 'Friend request sent'}), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/friends/accept', methods=['POST'])
def accept_friend_request():
    """Accept a friend request"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        friend_id = data.get('friend_id')
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Update status to accepted
            cursor.execute('''
                UPDATE friends
                SET status = 'accepted'
                WHERE user_id = ? AND friend_id = ?
            ''', (friend_id, user_id))
            
            # Create notification
            cursor.execute('''
                SELECT name FROM users WHERE id = ?
            ''', (user_id,))
            accepter = cursor.fetchone()
            
            cursor.execute('''
                INSERT INTO notifications (user_id, message, type)
                VALUES (?, ?, 'friend_accepted')
            ''', (friend_id, f"{accepter['name']} accepted your friend request!"))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({'message': 'Friend request accepted'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/friends/list/<int:user_id>', methods=['GET'])
def get_friends_list(user_id):
    """Get user's friends list with last message and unread count"""
    try:
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Complex query to get friends + last message + unread count
            # Works on both SQLite and Postgres
            query = '''
                SELECT 
                    u.id, u.name, u.email, u.profile_photo, u.is_online, u.last_seen,
                    f.status,
                    (SELECT message FROM messages m 
                     WHERE (m.sender_id = u.id AND m.receiver_id = ?) 
                        OR (m.sender_id = ? AND m.receiver_id = u.id)
                     ORDER BY m.created_at DESC LIMIT 1) as last_message,
                    (SELECT created_at FROM messages m 
                     WHERE (m.sender_id = u.id AND m.receiver_id = ?) 
                        OR (m.sender_id = ? AND m.receiver_id = u.id)
                     ORDER BY m.created_at DESC LIMIT 1) as last_message_time,
                    (SELECT COUNT(*) FROM messages m 
                     WHERE m.sender_id = u.id AND m.receiver_id = ? AND (m.is_read = 0 OR m.is_read = FALSE)) as unread_count
                FROM friends f
                JOIN users u ON (
                    (f.user_id = ? AND f.friend_id = u.id) OR
                    (f.friend_id = ? AND f.user_id = u.id)
                )
                WHERE (f.user_id = ? OR f.friend_id = ?)
                  AND f.status = 'accepted'
                ORDER BY COALESCE(last_message_time, '1970-01-01') DESC
            '''
            
            # Params: user_id (x5 for subqueries), user_id (x4 for main query)
            params = (user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id, user_id)
            
            cursor.execute(query, params)
            
            friends = [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
        
        return jsonify(friends), 200
        
    except Exception as e:
        print(f"Error in get_friends_list: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/friends/requests/<int:user_id>', methods=['GET'])
def get_friend_requests(user_id):
    """Get pending friend requests"""
    try:

        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT u.id, u.name, u.email, u.profile_photo, f.created_at, f.id as request_id
                FROM friends f
                JOIN users u ON f.user_id = u.id
                WHERE f.friend_id = ? AND f.status = 'pending'
                ORDER BY f.created_at DESC
            ''', (user_id,))
            
            requests = [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
        
        return jsonify(requests), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ CHAT SYSTEM ============

@app.route('/api/messages/send', methods=['POST'])
def send_message():
    """Send a message to a friend"""
    try:
        data = request.get_json()
        sender_id = data.get('sender_id')
        receiver_id = data.get('receiver_id')
        message = data.get('message')
        
        if not message or not message.strip():
            return jsonify({'error': 'Message cannot be empty'}), 400
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            # Verify they are friends
            cursor.execute('''
                SELECT * FROM friends
                WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
                  AND status = 'accepted'
            ''', (sender_id, receiver_id, receiver_id, sender_id))
            
            if not cursor.fetchone():
                return jsonify({'error': 'You can only message friends'}), 403
            
            # Send message
            cursor.execute('''
                INSERT INTO messages (sender_id, receiver_id, message)
                VALUES (?, ?, ?)
            ''', (sender_id, receiver_id, message))
            
            message_id = cursor.lastrowid
            
            # Create notification
            cursor.execute('''
                SELECT name FROM users WHERE id = ?
            ''', (sender_id,))
            sender = cursor.fetchone()
            
            cursor.execute('''
                INSERT INTO notifications (user_id, message, type)
                VALUES (?, ?, 'new_message')
            ''', (receiver_id, f"New message from {sender['name']}"))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({
            'message': 'Message sent',
            'message_id': message_id
        }), 201
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/conversation', methods=['POST'])
def get_conversation():
    """Get conversation between two users"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        friend_id = data.get('friend_id')
        
        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT m.*, 
                       sender.name as sender_name,
                       receiver.name as receiver_name
                FROM messages m
                JOIN users sender ON m.sender_id = sender.id
                JOIN users receiver ON m.receiver_id = receiver.id
                WHERE (m.sender_id = ? AND m.receiver_id = ?)
                   OR (m.sender_id = ? AND m.receiver_id = ?)
                ORDER BY m.created_at ASC
            ''', (user_id, friend_id, friend_id, user_id))
            
            messages = [dict(row) for row in cursor.fetchall()]
            
            # Mark messages as read
            cursor.execute('''
                UPDATE messages
                SET is_read = 1
                WHERE sender_id = ? AND receiver_id = ? AND (is_read = 0 OR is_read = FALSE)
            ''', (friend_id, user_id))
            
            conn.commit()
        finally:
            conn.close()
        
        return jsonify(messages), 200
        
    except Exception as e:
        print(f"Error in get_conversation: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/messages/unread/<int:user_id>', methods=['GET'])
def get_unread_count(user_id):
    """Get unread message count"""
    try:

        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT COUNT(*) as count
                FROM messages
                WHERE receiver_id = ? AND is_read = 0
            ''', (user_id,))
            
            result = cursor.fetchone()
        finally:
            conn.close()
        
        return jsonify({'unread_count': result['count']}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ NOTIFICATIONS ============

@app.route('/api/notifications/<int:user_id>', methods=['GET'])
def get_notifications(user_id):
    try:

        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT * FROM notifications 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT 50
            ''', (user_id,))
            
            notifications = [dict(row) for row in cursor.fetchall()]
        finally:
            conn.close()
        
        return jsonify(notifications), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/notifications/mark-read/<int:notification_id>', methods=['POST'])
def mark_notification_read(notification_id):
    try:

        conn = get_db()
        try:
            cursor = conn.cursor()
            
            cursor.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', (notification_id,))
            conn.commit()
        finally:
            conn.close()
        
        return jsonify({'message': 'Marked as read'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ============ INITIALIZATION ============
# Initialize database on startup (works with gunicorn and flask)
try:
    from backend.database import init_db
    init_db()
    print("Database initialized successfully!")
except ImportError:
    # Fallback for local development
    try:
        from database import init_db
        init_db()
        print("Database initialized successfully!")
    except Exception as e:
        print(f"Warning: Database initialization failed: {e}")

if __name__ == '__main__':
    print("=" * 60)
    print(" BijMij Social Server Starting... ")
    print("=" * 60)
    print("Server: http://localhost:5000")
    print("WebSocket: Enabled (Real-time location sharing)")
    print("Upload folders ready:")
    print(f"  - Users: {os.path.join(UPLOAD_FOLDER, 'users')}")
    print("=" * 60)
    
    # Use socketio.run instead of app.run for WebSocket support
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True)

