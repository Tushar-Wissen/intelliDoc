#!/bin/sh
set -e
celery -A app.celery_app:celery_app worker --loglevel="${LOG_LEVEL:-INFO}" --concurrency=1 &
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
