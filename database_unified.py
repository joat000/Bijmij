"""
Unified Database Module - Supports both SQLite (dev) and PostgreSQL (production)
Automatically switches based on DATABASE_URL environment variable
Provides a unified interface that works with existing SQLite-style code
"""
import os
from contextlib import contextmanager

# Detect which database to use
USE_POSTGRES = bool(os.environ.get('DATABASE_URL'))

if USE_POSTGRES:
    print("🚀 Using PostgreSQL (Production Mode)")
    import psycopg2
    from psycopg2 import pool, extras
    
    DATABASE_URL = os.environ.get('DATABASE_URL')
    connection_pool = None
    
    def init_connection_pool():
        """Initialize PostgreSQL connection pool"""
        global connection_pool
        
        if connection_pool is None:
            try:
                db_url = DATABASE_URL
                if db_url and db_url.startswith('postgres://'):
                    db_url = db_url.replace('postgres://', 'postgresql://', 1)
                
                connection_pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=1,
                    maxconn=20,
                    dsn=db_url
                )
                print("✅ PostgreSQL connection pool created!")
            except Exception as e:
                print(f"❌ Error creating connection pool: {e}")
                raise
    
    class PostgreSQLCursor:
        """Wrapper to make PostgreSQL cursor behave like SQLite cursor"""
        def __init__(self, cursor, conn):
            self._cursor = cursor
            self._conn = conn
            self.lastrowid = None
        
        def execute(self, query, params=None):
            """Execute query with automatic parameter conversion"""
            # Convert ? to %s for PostgreSQL
            adapted_query = query.replace('?', '%s')
            
            # Handle INTEGER/BOOLEAN differences
            adapted_query = adapted_query.replace(' = 1', ' = TRUE')
            adapted_query = adapted_query.replace(' = 0', ' = FALSE')
            adapted_query = adapted_query.replace('DEFAULT 0', 'DEFAULT FALSE')
            adapted_query = adapted_query.replace('DEFAULT 1', 'DEFAULT TRUE')
            
            result = self._cursor.execute(adapted_query, params or ())
            
            # Try to get lastrowid for INSERT statements
            if 'INSERT INTO' in query.upper() and 'RETURNING' not in query.upper():
                try:
                    # Extract table name
                    table = query.split('INSERT INTO')[1].split('(')[0].strip()
                    self._cursor.execute(f"SELECT currval(pg_get_serial_sequence('{table}', 'id'))")
                    row = self._cursor.fetchone()
                    self.lastrowid = row[0] if row else None
                except:
                    pass
            
            return result
        
        def fetchone(self):
            return self._cursor.fetchone()
        
        def fetchall(self):
            return self._cursor.fetchall()
        
        def fetchmany(self, size=None):
            return self._cursor.fetchmany(size) if size else self._cursor.fetchmany()
    
    class PostgreSQLConnection:
        """Wrapper to make PostgreSQL connection behave like SQLite connection"""
        def __init__(self, conn):
            self._conn = conn
            self._cursor = None
        
        def cursor(self):
            """Get cursor with dict-like rows"""
            raw_cursor = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            return PostgreSQLCursor(raw_cursor, self._conn)
        
        def commit(self):
            return self._conn.commit()
        
        def rollback(self):
            return self._conn.rollback()
        
        def close(self):
            # Don't actually close, will be returned to pool
            pass
        
        def __enter__(self):
            return self
        
        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_type:
                self._conn.rollback()
            return False
    
    @contextmanager
    def get_db():
        """Get PostgreSQL connection from pool (behaves like SQLite connection)"""
        if connection_pool is None:
            init_connection_pool()
        
        raw_conn = connection_pool.getconn()
        conn = PostgreSQLConnection(raw_conn)
        try:
            yield conn
            raw_conn.commit()
        except Exception as e:
            raw_conn.rollback()
            raise
        finally:
            connection_pool.putconn(raw_conn)
    
    # Define IntegrityError for exception handling
    IntegrityError = psycopg2.IntegrityError
    
else:
    print("🔧 Using SQLite (Development Mode)")
    import sqlite3
    
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'database.db')
    
    @contextmanager
    def get_db():
        """Get SQLite connection"""
        conn = sqlite3.connect(DATABASE_PATH)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
    
    # Define IntegrityError for exception handling
    IntegrityError = sqlite3.IntegrityError


def init_db():
    """Initialize database with proper schema for current database type"""
    with get_db() as conn:
        cursor = conn.cursor()
        
        if USE_POSTGRES:
            # PostgreSQL schema with optimized types and indexes
            
            # Enable PostGIS if available
            try:
                cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
            except:
                pass
            
            # Users table
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
            
            # Optimized indexes
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_user_location 
                ON users(latitude, longitude) 
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_user_email ON users(email)
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
            
            # User activity table
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
            
            # Friends table
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
            
        else:
            # SQLite schema (existing schema)
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    profile_photo TEXT,
                    latitude REAL,
                    longitude REAL,
                    last_location_update TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_user_location 
                ON users(latitude, longitude)
            ''')
            
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_user_last_update 
                ON users(last_location_update)
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    type TEXT DEFAULT 'info',
                    is_read INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS user_activity (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    user_type TEXT NOT NULL,
                    email TEXT NOT NULL,
                    ip_address TEXT,
                    latitude REAL,
                    longitude REAL,
                    action TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS friends (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    friend_id INTEGER NOT NULL,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (friend_id) REFERENCES users(id),
                    UNIQUE(user_id, friend_id)
                )
            ''')
            
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    receiver_id INTEGER NOT NULL,
                    message TEXT NOT NULL,
                    is_read INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (sender_id) REFERENCES users(id),
                    FOREIGN KEY (receiver_id) REFERENCES users(id)
                )
            ''')
        
        conn.commit()
        print(f"✅ Database initialized successfully! (Using {'PostgreSQL' if USE_POSTGRES else 'SQLite'})")


if __name__ == '__main__':
    init_db()
