#!/bin/bash
# Render.com build script

set -e

echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "Running database migration..."
python migrate_database.py

echo "Build complete!"
