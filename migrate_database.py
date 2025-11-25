"""
Database Migration Script
Adds last_location_update field and indexes for real-time location sharing
"""
import sqlite3
import os

DATABASE_PATH = os.path.join(os.path.dirname(__file__), '..', 'database.db')

def migrate_database():
    """Add new fields and indexes for real-time location sharing"""
    print("Starting database migration...")
    
    # Check if database exists
    if not os.path.exists(DATABASE_PATH):
        print("Database does not exist. Creating new database...")
        from backend.database import init_db
        init_db()
        print("Database created successfully!")
        return
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if users table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
        if not cursor.fetchone():
            print("Users table does not exist. Initializing database...")
            conn.close()
            from backend.database import init_db
            init_db()
            return
        
        # Check if last_location_update column exists
        cursor.execute("PRAGMA table_info(users)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'last_location_update' not in columns:
            print("Adding last_location_update column...")
            cursor.execute('''
                ALTER TABLE users 
                ADD COLUMN last_location_update TIMESTAMP
            ''')
            print("Column added successfully")
        else:
            print("Column already exists")
        
        # Create indexes for fast location queries
        print("Creating spatial indexes...")
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_location 
            ON users(latitude, longitude)
        ''')
        print("Location index created")
        
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_user_last_update 
            ON users(last_location_update)
        ''')
        print("Timestamp index created")
        
        # Enable WAL mode for better concurrent access
        cursor.execute("PRAGMA journal_mode=WAL")
        print("WAL mode enabled")
        
        conn.commit()
        print("\nDatabase migration completed successfully!")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == '__main__':
    migrate_database()
