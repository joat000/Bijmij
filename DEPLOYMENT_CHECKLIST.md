# 📋 Deployment Checklist - Real-Time Location Sharing

## Pre-Deployment

- [ ] **Backup current database**
  ```bash
  cp database.db database.db.backup_$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **Backup uploads folder**
  ```bash
  cp -r uploads uploads.backup_$(date +%Y%m%d_%H%M%S)
  ```

- [ ] **Test locally first**
  - [ ] Server starts successfully
  - [ ] WebSocket connects
  - [ ] Location sharing works
  - [ ] Latency < 100ms

- [ ] **Review deployment guide**
  - Read `DEPLOYMENT_GUIDE.md`
  - Understand all steps
  - Prepare server credentials

---

## Deployment Steps

### 1. Update Server Configuration

- [ ] **Update requirements.txt**
  - [ ] flask-socketio==5.3.6
  - [ ] python-socketio==5.11.1
  - [ ] eventlet==0.35.2

- [ ] **Install dependencies**
  ```bash
  pip install -r requirements.txt
  ```

### 2. Upload Files

#### New Files:
- [ ] `backend/websocket_server.py`
- [ ] `static/js/location-manager.js`
- [ ] `migrate_database.py`

#### Modified Files:
- [ ] `backend/app.py`
- [ ] `backend/database.py`
- [ ] `static/js/app.js`
- [ ] `static/index.html`
- [ ] `requirements.txt`

### 3. Database Migration

- [ ] **Run migration script**
  ```bash
  python migrate_database.py
  ```

- [ ] **Verify migration**
  - [ ] Column `last_location_update` added
  - [ ] Indexes created
  - [ ] WAL mode enabled

### 4. Update Gunicorn Configuration

- [ ] **Change worker class to eventlet**
  ```bash
  gunicorn --worker-class eventlet -w 1 backend.app:app --bind 0.0.0.0:5000
  ```

- [ ] **Update systemd service file**
  - [ ] Worker class: eventlet
  - [ ] Workers: 1 (for WebSocket)

### 5. Update Nginx Configuration

- [ ] **Add WebSocket support**
  ```nginx
  location /socket.io/ {
      proxy_pass http://bijmij_app/socket.io/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_connect_timeout 7d;
      proxy_send_timeout 7d;
      proxy_read_timeout 7d;
  }
  ```

- [ ] **Test Nginx config**
  ```bash
  sudo nginx -t
  ```

- [ ] **Reload Nginx**
  ```bash
  sudo systemctl reload nginx
  ```

### 6. Update Frontend

- [ ] **Update WebSocket URL in location-manager.js**
  - Change from `http://localhost:5000`
  - To `https://your-domain.com` or `window.location.origin`

### 7. Restart Services

- [ ] **Reload systemd**
  ```bash
  sudo systemctl daemon-reload
  ```

- [ ] **Restart app service**
  ```bash
  sudo systemctl restart bijmij
  ```

- [ ] **Check service status**
  ```bash
  sudo systemctl status bijmij
  ```

---

## Post-Deployment Testing

### Server-Side Checks

- [ ] **Service is running**
  ```bash
  sudo systemctl status bijmij
  ```

- [ ] **No errors in logs**
  ```bash
  sudo journalctl -u bijmij -n 50
  ```

- [ ] **WebSocket port listening**
  ```bash
  netstat -an | grep :5000
  ```

### Client-Side Checks

- [ ] **Open website in browser**
- [ ] **Open browser console (F12)**
- [ ] **Register/Login**
- [ ] **Grant location permission**

#### Expected Console Output:
```
✅ WebSocket connected
📍 Location Active (±10m)
⚡ 67ms
```

### Functional Testing

- [ ] **Single user test**
  - [ ] User appears on map immediately
  - [ ] Location updates in real-time
  - [ ] Latency indicator shows < 100ms

- [ ] **Multi-user test**
  - [ ] Open in two different browsers/devices
  - [ ] Both users see each other
  - [ ] Updates happen within 0.1 seconds
  - [ ] Distance calculations correct

- [ ] **Performance test**
  - [ ] Latency consistently < 100ms
  - [ ] No connection drops
  - [ ] Smooth marker animations

---

## Troubleshooting

### WebSocket Not Connecting

- [ ] Check Nginx WebSocket config
- [ ] Verify Gunicorn worker class (eventlet)
- [ ] Check firewall rules
- [ ] Verify SSL certificate (HTTPS required)
- [ ] Check browser console for errors

### High Latency

- [ ] Check server load (`htop`)
- [ ] Verify database WAL mode
- [ ] Check network latency
- [ ] Monitor WebSocket connections

### Location Not Working

- [ ] Verify HTTPS (required for geolocation)
- [ ] Check browser permissions
- [ ] Test on different devices
- [ ] Check console for errors

---

## Monitoring

### Continuous Monitoring

- [ ] **Set up log monitoring**
  ```bash
  sudo journalctl -u bijmij -f
  ```

- [ ] **Monitor WebSocket connections**
  ```bash
  watch -n 5 'netstat -an | grep :5000 | grep ESTABLISHED | wc -l'
  ```

- [ ] **Monitor server resources**
  ```bash
  htop
  ```

### Performance Metrics

- [ ] **Track latency**
  - Target: < 100ms
  - Monitor via latency indicator

- [ ] **Track active users**
  - Check WebSocket connections
  - Monitor server logs

- [ ] **Database performance**
  - Check query times
  - Monitor database size

---

## Rollback Plan (If Needed)

### Quick Rollback

- [ ] **Restore database backup**
  ```bash
  cp database.db.backup_YYYYMMDD_HHMMSS database.db
  ```

- [ ] **Revert code changes**
  ```bash
  git checkout main~1  # Or specific commit
  ```

- [ ] **Restart service**
  ```bash
  sudo systemctl restart bijmij
  ```

### Full Rollback

- [ ] Stop service
- [ ] Restore all backups
- [ ] Revert Nginx config
- [ ] Revert Gunicorn config
- [ ] Restart all services

---

## Success Criteria

### ✅ Deployment Successful If:

- [ ] Server starts without errors
- [ ] WebSocket connects successfully
- [ ] Users appear on map immediately (< 0.1s)
- [ ] Location updates within 0.1s
- [ ] Latency indicator shows < 100ms
- [ ] Multiple users can see each other
- [ ] No errors in logs
- [ ] Performance is smooth and responsive

---

## Documentation

- [ ] **Update internal docs**
- [ ] **Notify team of changes**
- [ ] **Document any issues encountered**
- [ ] **Update monitoring dashboards**

---

## Final Verification

### Before Marking Complete:

1. [ ] All checklist items completed
2. [ ] Testing passed on production
3. [ ] No errors in logs
4. [ ] Performance meets targets
5. [ ] Users can successfully share location
6. [ ] Backups are safe and accessible
7. [ ] Rollback plan tested and ready

---

## 🎉 Deployment Complete!

**Date:** _______________
**Deployed by:** _______________
**Version:** Real-Time Location Sharing v1.0
**Status:** ✅ Success / ❌ Issues

**Notes:**
_______________________________________
_______________________________________
_______________________________________

---

## Quick Reference

### Useful Commands

```bash
# View logs
sudo journalctl -u bijmij -f

# Restart service
sudo systemctl restart bijmij

# Check status
sudo systemctl status bijmij

# Test Nginx
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Monitor connections
netstat -an | grep :5000 | grep ESTABLISHED

# Check database
sqlite3 database.db "PRAGMA journal_mode;"
```

### Support Files

- `DEPLOYMENT_GUIDE.md` - Full deployment instructions
- `QUICKSTART.md` - Quick testing guide
- `REALTIME_OPTIMIZATION.md` - Technical details
- `deploy.sh` / `deploy.ps1` - Automated deployment scripts
