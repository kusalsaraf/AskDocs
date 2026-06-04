#!/usr/bin/env bash
set -euo pipefail

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Starting Celery worker..."
celery -A config worker --loglevel=info --pool=solo --concurrency=1 &

echo "Starting Gunicorn..."
exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 1 \
    --worker-class gthread \
    --threads 2 \
    --timeout 120
