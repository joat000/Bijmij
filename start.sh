#!/bin/bash
# Start command for production deployment

# Run with Gunicorn using threading mode
gunicorn -c gunicorn_config.py backend.app:app
