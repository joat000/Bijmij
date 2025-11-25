"""
Database Query Adapter
Converts queries between SQLite (?) and PostgreSQL (%s) parameter styles
"""

def adapt_query(query, use_postgres=None):
    """
    Convert query parameters from SQLite (?) to PostgreSQL (%s) style
    
    Args:
        query: SQL query string
        use_postgres: If True, convert to PostgreSQL. If False, keep SQLite. If None, auto-detect.
    
    Returns:
        Adapted query string
    """
    import os
    
    if use_postgres is None:
        # Auto-detect based on DATABASE_URL
        use_postgres = bool(os.environ.get('DATABASE_URL'))
    
    if use_postgres:
        # Convert ? to %s for PostgreSQL
        # Also convert INTEGER to SERIAL, TEXT to VARCHAR where appropriate
        query = query.replace('?', '%s')
        query = query.replace('INTEGER DEFAULT 0', 'BOOLEAN DEFAULT FALSE')
        query = query.replace('is_read = 1', 'is_read = TRUE')
        query = query.replace('is_read = 0', 'is_read = FALSE')
    
    return query


def get_lastrowid(cursor, conn, table_name='users'):
    """
    Get last inserted row ID (works for both SQLite and PostgreSQL)
    
    For PostgreSQL, we need to query the sequence
    For SQLite, we use cursor.lastrowid
    """
    import os
    
    if os.environ.get('DATABASE_URL'):
        # PostgreSQL - query the sequence
        cursor.execute(f"SELECT currval(pg_get_serial_sequence('{table_name}', 'id'))")
        return cursor.fetchone()[0]
    else:
        # SQLite - use lastrowid
        return cursor.lastrowid


def handle_integrity_error(error):
    """
    Handle database integrity errors (works for both databases)
    """
    import os
    
    if os.environ.get('DATABASE_URL'):
        # PostgreSQL
        import psycopg2
        return isinstance(error, psycopg2.IntegrityError)
    else:
        # SQLite
        import sqlite3
        return isinstance(error, sqlite3.IntegrityError)
