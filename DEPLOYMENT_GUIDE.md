# 🚀 Deployment Guide - Real-Time Location Sharing

## Deploying to Your Live Website

### Prerequisites
- ✅ Live website already running
- ✅ SSH access to server
- ✅ Git repository (recommended)
- ✅ Python 3.8+ on server

---

## 📋 Deployment Steps

### Step 1: Backup Your Current Database

**IMPORTANT: Always backup before deploying!**

```bash
# SSH into your server
ssh user@your-server.com

# Navigate to your app directory
cd /path/to/your/app

# Backup database
cp database.db database.db.backup_$(date +%Y%m%d_%H%M%S)

# Backup uploads folder
cp -r uploads uploads.backup_$(date +%Y%m%d_%H%M%S)
```

### Step 2: Update Dependencies

```bash
# Update requirements.txt on server
# Add these new dependencies:
flask-socketio==5.3.6
python-socketio==5.11.1
eventlet==0.35.2

# Install new dependencies
pip install -r requirements.txt
```

### Step 3: Upload New Files

#### Option A: Using Git (Recommended)

```bash
# On your local machine
git add .
git commit -m "Add real-time location sharing with WebSocket support"
git push origin main

# On your server
git pull origin main
```

#### Option B: Using SCP/SFTP

```bash
# From your local machine
# Upload new files
scp backend/websocket_server.py user@server:/path/to/app/backend/
scp static/js/location-manager.js user@server:/path/to/app/static/js/
scp migrate_database.py user@server:/path/to/app/

# Upload modified files
scp backend/app.py user@server:/path/to/app/backend/
scp backend/database.py user@server:/path/to/app/backend/
scp static/js/app.js user@server:/path/to/app/static/js/
scp static/index.html user@server:/path/to/app/static/
scp requirements.txt user@server:/path/to/app/
```

### Step 4: Migrate Database

```bash
# SSH into server
ssh user@your-server.com
cd /path/to/your/app

# Run migration script
python migrate_database.py
```

Expected output:
```
Starting database migration...
Adding last_location_update column...
Column added successfully
Creating spatial indexes...
Location index created
Timestamp index created
WAL mode enabled

Database migration completed successfully!
```

### Step 5: Update Server Configuration

#### For Gunicorn (Production)

**Create/Update `gunicorn_config.py`:**

```python
# gunicorn_config.py
import multiprocessing

# Server socket
bind = "0.0.0.0:5000"
backlog = 2048

# Worker processes
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = 'eventlet'  # IMPORTANT: Use eventlet for WebSocket support
worker_connections = 1000
timeout = 120
keepalive = 5

# Logging
accesslog = '/var/log/gunicorn/access.log'
errorlog = '/var/log/gunicorn/error.log'
loglevel = 'info'

# Process naming
proc_name = 'bijmij_app'

# Server mechanics
daemon = False
pidfile = '/var/run/gunicorn.pid'
```

**Update your start command:**

```bash
# OLD (without WebSocket)
gunicorn backend.app:app -c gunicorn_config.py

# NEW (with WebSocket support)
gunicorn --worker-class eventlet -w 1 backend.app:app --bind 0.0.0.0:5000
```

**Important:** With WebSocket, use only **1 worker** or use a message queue like Redis for multi-worker setups.

#### For Systemd Service

**Update `/etc/systemd/system/bijmij.service`:**

```ini
[Unit]
Description=BijMij Social App with WebSocket Support
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/path/to/your/app
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/gunicorn --worker-class eventlet -w 1 backend.app:app --bind 0.0.0.0:5000

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Reload and restart:**

```bash
sudo systemctl daemon-reload
sudo systemctl restart bijmij
sudo systemctl status bijmij
```

### Step 6: Update Nginx Configuration

**Update `/etc/nginx/sites-available/bijmij`:**

```nginx
upstream bijmij_app {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL Configuration
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    # Static files
    location /static/ {
        alias /path/to/your/app/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /uploads/ {
        alias /path/to/your/app/uploads/;
        expires 30d;
    }

    # WebSocket support - IMPORTANT!
    location /socket.io/ {
        proxy_pass http://bijmij_app/socket.io/;
        proxy_http_version 1.1;
        
        # WebSocket headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for WebSocket
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # API and main app
    location / {
        proxy_pass http://bijmij_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

**Test and reload Nginx:**

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### Step 7: Update Frontend WebSocket URL

**In `static/js/location-manager.js`, update line 25:**

```javascript
// OLD (development)
this.socket = io('http://localhost:5000', {

// NEW (production)
this.socket = io('https://your-domain.com', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS
});
```

Or make it dynamic:

```javascript
// Automatically use current domain
const socketUrl = window.location.origin;
this.socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS
});
```

### Step 8: Verify Deployment

#### Check Server Status

```bash
# Check if service is running
sudo systemctl status bijmij

# Check logs
sudo journalctl -u bijmij -f

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

#### Test WebSocket Connection

Open browser console on your live site:

```javascript
// Should see:
✅ WebSocket connected
📍 Location Active (±10m)
⚡ 67ms
```

### Step 9: Monitor Performance

```bash
# Monitor server resources
htop

# Monitor WebSocket connections
netstat -an | grep :5000 | grep ESTABLISHED | wc -l

# Check database size
ls -lh database.db*
```

---

## 🔧 Troubleshooting

### WebSocket Connection Failed

**Problem:** "WebSocket connection failed" in browser console

**Solutions:**

1. **Check Nginx WebSocket config:**
   ```bash
   sudo nginx -t
   grep -A 10 "socket.io" /etc/nginx/sites-available/bijmij
   ```

2. **Verify Gunicorn worker class:**
   ```bash
   ps aux | grep gunicorn
   # Should show: --worker-class eventlet
   ```

3. **Check firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 5000/tcp  # If needed
   ```

### High Latency (> 300ms)

**Solutions:**

1. **Check server load:**
   ```bash
   uptime
   free -h
   ```

2. **Optimize database:**
   ```bash
   sqlite3 database.db "VACUUM;"
   sqlite3 database.db "ANALYZE;"
   ```

3. **Enable Redis for scaling:**
   ```bash
   pip install redis
   # Update websocket_server.py to use Redis pub/sub
   ```

### Database Lock Errors

**Solution:** Ensure WAL mode is enabled:

```bash
sqlite3 database.db "PRAGMA journal_mode=WAL;"
```

---

## 📊 Production Checklist

- [ ] Database backed up
- [ ] Dependencies installed
- [ ] New files uploaded
- [ ] Database migrated
- [ ] Gunicorn using eventlet worker
- [ ] Nginx WebSocket config added
- [ ] SSL/HTTPS enabled
- [ ] Frontend WebSocket URL updated
- [ ] Service restarted
- [ ] WebSocket connection tested
- [ ] Location sharing tested
- [ ] Performance monitored
- [ ] Logs checked

---

## 🚀 Advanced: Scaling for High Traffic

### Option 1: Redis for Multi-Worker Support

```bash
# Install Redis
sudo apt install redis-server
pip install redis

# Update websocket_server.py
# Use Redis pub/sub for message broadcasting
```

### Option 2: Load Balancer with Sticky Sessions

```nginx
upstream bijmij_cluster {
    ip_hash;  # Sticky sessions
    server 127.0.0.1:5000;
    server 127.0.0.1:5001;
    server 127.0.0.1:5002;
}
```

### Option 3: Separate WebSocket Server

```bash
# Run WebSocket server on separate port
gunicorn --worker-class eventlet -w 1 backend.app:app --bind 0.0.0.0:5001

# Update Nginx to route /socket.io/ to port 5001
```

---

## 🎉 Deployment Complete!

Your live website now has:
- ⚡ Sub-100ms location sharing
- 🗺️ Real-time user positioning
- 🔄 WebSocket connectivity
- 📱 Optimized performance

**Test it:** Open your live site in two browsers and watch the magic! 🚀

---

## 📞 Support

If you encounter issues:

1. Check logs: `sudo journalctl -u bijmij -f`
2. Test locally first
3. Verify all steps completed
4. Check browser console for errors
5. Monitor server resources

**Remember:** HTTPS is required for geolocation in production!
