#!/bin/bash

# BijMij Real-Time Location Sharing - Deployment Script
# This script deploys the WebSocket updates to your live server

set -e  # Exit on error

echo "=========================================="
echo "BijMij Real-Time Deployment Script"
echo "=========================================="
echo ""

# Configuration - UPDATE THESE!
SERVER_USER="your_username"
SERVER_HOST="your-server.com"
SERVER_PATH="/path/to/your/app"
SERVICE_NAME="bijmij"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Backing up database on server...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && cp database.db database.db.backup_\$(date +%Y%m%d_%H%M%S)"
echo -e "${GREEN}✓ Backup created${NC}"
echo ""

echo -e "${YELLOW}Step 2: Uploading new files...${NC}"
# Upload new files
scp backend/websocket_server.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp static/js/location-manager.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/static/js/
scp migrate_database.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/

# Upload modified files
scp backend/app.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp backend/database.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp static/js/app.js $SERVER_USER@$SERVER_HOST:$SERVER_PATH/static/js/
scp static/index.html $SERVER_USER@$SERVER_HOST:$SERVER_PATH/static/
scp requirements.txt $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
echo -e "${GREEN}✓ Files uploaded${NC}"
echo ""

echo -e "${YELLOW}Step 3: Installing dependencies...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && source venv/bin/activate && pip install -r requirements.txt"
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Running database migration...${NC}"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && source venv/bin/activate && python migrate_database.py"
echo -e "${GREEN}✓ Database migrated${NC}"
echo ""

echo -e "${YELLOW}Step 5: Restarting service...${NC}"
ssh $SERVER_USER@$SERVER_HOST "sudo systemctl restart $SERVICE_NAME"
sleep 3
ssh $SERVER_USER@$SERVER_HOST "sudo systemctl status $SERVICE_NAME --no-pager"
echo -e "${GREEN}✓ Service restarted${NC}"
echo ""

echo -e "${GREEN}=========================================="
echo "Deployment Complete! 🚀"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Open your website in a browser"
echo "2. Check browser console for WebSocket connection"
echo "3. Test location sharing with two devices"
echo "4. Monitor latency indicator (should be < 100ms)"
echo ""
echo "Logs: ssh $SERVER_USER@$SERVER_HOST 'sudo journalctl -u $SERVICE_NAME -f'"
echo ""
