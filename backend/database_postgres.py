import psycopg2
from psycopg2 import pool, extras
import os
from datetime import datetime
from contextlib import contextmanager

# Database configuration from environment variables
DATABASE_URL = os.environ.get('DATABASE_URL')

# Connection pool for efficient database connections
connection_pool = None

def init_connection_pool():
    """Initialize PostgreSQL connection pool"""
    global connection_pool
    
    if connection_pool is None:
        try:
            # Parse DATABASE_URL if it starts with postgres://
            db_url = DATABASE_URL
            if db_url and db_url.startswith('postgres://'):
                db_url = db_url.replace('postgres://', 'postgresql://', 1)
            
            connection_pool = psycopg2.pool.ThreadedConnectionPool(
                minconn=1,
                maxconn=20,  # Adjust based on your needs
                dsn=db_url
            )
            print("✅ PostgreSQL connection pool created successfully!")
        except Exception as e:
            print(f"❌ Error creating connection pool: {e}")
            raise

@contextmanager
def get_db():
    """Get database connection from pool with automatic cleanup"""
    if connection_pool is None:
        init_connection_pool()
    
    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)

def get_cursor(conn):
    """Get a cursor that returns results as dictionaries"""
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def init_db():
    """Initialize PostgreSQL database with optimized schema"""
    with get_db() as conn:
        cursor = get_cursor(conn)
        
        # Enable PostGIS extension for advanced geospatial queries (optional but powerful)
        try:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
            print("✅ PostGIS extension enabled for advanced geospatial features")
        except Exception as e:
            print(f"⚠️  PostGIS not available (optional): {e}")
        
        # Users table with optimized indexes
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(64) NOT NULL,
                profile_photo TEXT,
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                last_location_update TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create optimized indexes for ultra-fast queries
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_location 
            ON users(latitude, longitude) 
            WHERE latitude IS NOT NULL AND longitude IS NOT NULL
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_email 
            ON users(email)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_last_update 
            ON users(last_location_update DESC)
        ''')
        
        # Notifications table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                type VARCHAR(50) DEFAULT 'info',
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_notifications_user 
            ON notifications(user_id, is_read, created_at DESC)
        ''')
        
        # User activity tracking table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_activity (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                user_type VARCHAR(50) NOT NULL,
                email VARCHAR(255) NOT NULL,
                ip_address VARCHAR(45),
                latitude DOUBLE PRECISION,
                longitude DOUBLE PRECISION,
                action VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_activity_user 
            ON user_activity(user_id, timestamp DESC)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_activity_timestamp 
            ON user_activity(timestamp DESC)
        ''')
        
        # Friends table with unique constraint
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS friends (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status VARCHAR(20) DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, friend_id)
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_friends_user 
            ON friends(user_id, status)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_friends_friend 
            ON friends(friend_id, status)
        ''')
        
        # Messages table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                is_read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_messages_conversation 
            ON messages(sender_id, receiver_id, created_at)
        ''')
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_messages_unread 
            ON messages(receiver_id, is_read) 
            WHERE is_read = FALSE
        ''')
        
        conn.commit()
        print("✅ PostgreSQL database initialized with optimized schema!")

def close_connection_pool():
    """Close all connections in the pool"""
    global connection_pool
    if connection_pool:
        connection_pool.closeall()
        print("✅ PostgreSQL connection pool closed")

if __name__ == '__main__':
    init_db()
