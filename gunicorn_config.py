# Gunicorn configuration for production deployment
# Compatible with Python 3.13+ and all platforms

import multiprocessing
import os

# Server socket
bind = "0.0.0.0:" + str(os.getenv("PORT", "5000"))
backlog = 2048

# Worker processes
# For WebSocket with threading mode, use 1 worker
# For scaling, use Redis with multiple workers
workers = 1
worker_class = 'sync'  # Use sync with threading mode
threads = 4  # Handle multiple connections per worker
worker_connections = 1000
timeout = 120
keepalive = 5

# Logging
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
loglevel = 'info'

# Process naming
proc_name = 'bijmij_realtime'

# Server mechanics
daemon = False
