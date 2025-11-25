
import os
import sys

# Add current directory to path
sys.path.append(os.getcwd())

try:
    from backend.database_unified import get_db, init_db
    print("[SUCCESS] Successfully imported get_db")
    
    # Test 1: get_db() as connection
    print("Testing get_db() as connection...")
    conn = get_db()
    print(f"  Type: {type(conn)}")
    cursor = conn.cursor()
    print("  Cursor created successfully")
    conn.close()
    print("[SUCCESS] Test 1 passed")
    
    # Test 2: get_db() as context manager (for init_db style usage)
    # Since connection objects are context managers, this should work
    print("Testing get_db() as context manager...")
    with get_db() as conn:
        print(f"  Type inside with: {type(conn)}")
        cursor = conn.cursor()
        print("  Cursor inside with created successfully")
    print("[SUCCESS] Test 2 passed")
    
    print("\n[SUCCESS] All tests passed! The fix is working.")
    
except Exception as e:
    print(f"\n[ERROR] Test failed: {e}")
    import traceback
    traceback.print_exc()
