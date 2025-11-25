# BijMij Real-Time Location Sharing - Deployment Script (PowerShell)
# This script deploys the WebSocket updates to your live server

# Configuration - UPDATE THESE!
$SERVER_USER = "your_username"
$SERVER_HOST = "your-server.com"
$SERVER_PATH = "/path/to/your/app"
$SERVICE_NAME = "bijmij"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "BijMij Real-Time Deployment Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Backup
Write-Host "Step 1: Backing up database on server..." -ForegroundColor Yellow
ssh "$SERVER_USER@$SERVER_HOST" "cd $SERVER_PATH && cp database.db database.db.backup_`$(date +%Y%m%d_%H%M%S)"
Write-Host "✓ Backup created" -ForegroundColor Green
Write-Host ""

# Step 2: Upload files
Write-Host "Step 2: Uploading new files..." -ForegroundColor Yellow

# New files
scp backend/websocket_server.py "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/backend/"
scp static/js/location-manager.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/static/js/"
scp migrate_database.py "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"

# Modified files
scp backend/app.py "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/backend/"
scp backend/database.py "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/backend/"
scp static/js/app.js "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/static/js/"
scp static/index.html "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/static/"
scp requirements.txt "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"

Write-Host "✓ Files uploaded" -ForegroundColor Green
Write-Host ""

# Step 3: Install dependencies
Write-Host "Step 3: Installing dependencies..." -ForegroundColor Yellow
ssh "$SERVER_USER@$SERVER_HOST" "cd $SERVER_PATH && source venv/bin/activate && pip install -r requirements.txt"
Write-Host "✓ Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 4: Migrate database
Write-Host "Step 4: Running database migration..." -ForegroundColor Yellow
ssh "$SERVER_USER@$SERVER_HOST" "cd $SERVER_PATH && source venv/bin/activate && python migrate_database.py"
Write-Host "✓ Database migrated" -ForegroundColor Green
Write-Host ""

# Step 5: Restart service
Write-Host "Step 5: Restarting service..." -ForegroundColor Yellow
ssh "$SERVER_USER@$SERVER_HOST" "sudo systemctl restart $SERVICE_NAME"
Start-Sleep -Seconds 3
ssh "$SERVER_USER@$SERVER_HOST" "sudo systemctl status $SERVICE_NAME --no-pager"
Write-Host "✓ Service restarted" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete! 🚀" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Open your website in a browser"
Write-Host "2. Check browser console for WebSocket connection"
Write-Host "3. Test location sharing with two devices"
Write-Host "4. Monitor latency indicator (should be < 100ms)"
Write-Host ""
Write-Host "View logs: ssh $SERVER_USER@$SERVER_HOST 'sudo journalctl -u $SERVICE_NAME -f'"
Write-Host ""
