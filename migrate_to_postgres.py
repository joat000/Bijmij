"""
Migration Script: SQLite → PostgreSQL
Transfers all data from your local SQLite database to PostgreSQL
"""
import sqlite3
import psycopg2
from psycopg2 import extras
import os
from datetime import datetime

def migrate_sqlite_to_postgres(sqlite_path, postgres_url):
    """
    Migrate all data from SQLite to PostgreSQL
    """
    print("=" * 70)
    print(" [INFO] DATABASE MIGRATION: SQLite -> PostgreSQL")
    print("=" * 70)
    
    # Connect to SQLite
    print("\n[INFO] Connecting to SQLite database...")
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()
    
    # Connect to PostgreSQL
    print("[INFO] Connecting to PostgreSQL database...")
    
    # Fix postgres:// to postgresql://
    if postgres_url.startswith('postgres://'):
        postgres_url = postgres_url.replace('postgres://', 'postgresql://', 1)
    
    pg_conn = psycopg2.connect(postgres_url)
    pg_cursor = pg_conn.cursor(cursor_factory=extras.RealDictCursor)
    
    print("[SUCCESS] Connected to both databases!\n")
    
    # Tables to migrate in order (respecting foreign keys)
    tables = ['users', 'notifications', 'user_activity', 'friends', 'messages']
    
    total_migrated = 0
    
    for table in tables:
        print(f"[INFO] Migrating table: {table}")
        
        # Get all data from SQLite
        sqlite_cursor.execute(f"SELECT * FROM {table}")
        rows = sqlite_cursor.fetchall()
        
        if not rows:
            print(f"   [WARN] No data found in {table}")
            continue
        
        # Get column names
        columns = [description[0] for description in sqlite_cursor.description]
        
        # Prepare PostgreSQL insert
        placeholders = ', '.join(['%s'] * len(columns))
        columns_str = ', '.join(columns)
        
        # Handle SERIAL columns (auto-increment)
        if 'id' in columns:
            # Temporarily allow manual ID insertion
            pg_cursor.execute(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), 1, false);")
        
        insert_query = f"INSERT INTO {table} ({columns_str}) VALUES ({placeholders})"
        
        # Convert SQLite rows to tuples
        data = [tuple(row) for row in rows]
        
        # Batch insert for efficiency
        try:
            extras.execute_batch(pg_cursor, insert_query, data, page_size=100)
            pg_conn.commit()
            
            # Reset sequence to max ID
            if 'id' in columns:
                pg_cursor.execute(f"""
                    SELECT setval(pg_get_serial_sequence('{table}', 'id'), 
                                  COALESCE((SELECT MAX(id) FROM {table}), 1), 
                                  true);
                """)
                pg_conn.commit()
            
            print(f"   [SUCCESS] Migrated {len(rows)} rows from {table}")
            total_migrated += len(rows)
            
        except Exception as e:
            print(f"   [ERROR] Error migrating {table}: {e}")
            pg_conn.rollback()
    
    # Close connections
    sqlite_conn.close()
    pg_conn.close()
    
    print("\n" + "=" * 70)
    print(f" [SUCCESS] MIGRATION COMPLETE! Total rows migrated: {total_migrated}")
    print("=" * 70)
    print("\n[INFO] Next steps:")
    print("   1. Set DATABASE_URL environment variable on your server")
    print("   2. Deploy your application")
    print("   3. Your app will automatically use PostgreSQL!")
    print("\n")


def verify_migration(postgres_url):
    """Verify the migration was successful"""
    print("\n[INFO] Verifying migration...")
    
    if postgres_url.startswith('postgres://'):
        postgres_url = postgres_url.replace('postgres://', 'postgresql://', 1)
    
    pg_conn = psycopg2.connect(postgres_url)
    pg_cursor = pg_conn.cursor()
    
    tables = ['users', 'notifications', 'user_activity', 'friends', 'messages']
    
    print("\n[INFO] Row counts:")
    for table in tables:
        pg_cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = pg_cursor.fetchone()[0]
        print(f"   {table}: {count} rows")
    
    pg_conn.close()
    print("\n[SUCCESS] Verification complete!\n")


if __name__ == '__main__':
    import sys
    
    # Configuration
    # Check for custom DB path argument
    if len(sys.argv) > 1 and sys.argv[1].endswith('.db'):
        SQLITE_PATH = sys.argv[1]
        print(f"[INFO] Using custom database file: {SQLITE_PATH}")
    else:
        SQLITE_PATH = os.path.join(os.path.dirname(__file__), '..', 'database.db')
        
    POSTGRES_URL = os.environ.get('DATABASE_URL')
    
    if not POSTGRES_URL:
        print("\n❌ ERROR: DATABASE_URL environment variable not set!")
        print("\n💡 Set it like this:")
        print("   Windows PowerShell:")
        print('   $env:DATABASE_URL="postgresql://user:password@host:port/database"')
        print("\n   Linux/Mac:")
        print('   export DATABASE_URL="postgresql://user:password@host:port/database"')
        print("\n")
        exit(1)
    
    if not os.path.exists(SQLITE_PATH):
        print(f"\n❌ ERROR: SQLite database not found at {SQLITE_PATH}")
        exit(1)
    
    # Run migration
    migrate_sqlite_to_postgres(SQLITE_PATH, POSTGRES_URL)
    
    # Verify
    verify_migration(POSTGRES_URL)
