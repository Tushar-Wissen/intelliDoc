from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery("intellidoc-ai", broker=settings.celery_broker_url)
celery_app.conf.update(
    include=["app.pipeline.orchestrator"],
    result_backend=settings.celery_broker_url,
    task_always_eager=settings.celery_task_always_eager,
    task_eager_propagates=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
