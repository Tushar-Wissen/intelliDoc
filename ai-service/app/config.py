"""Env-driven AI Service settings. Names match Core API / Compose where shared."""

from __future__ import annotations

import os


def _bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


class Settings:
    # ASSUMPTION (§27): OCR "low-text" means fewer than this many non-whitespace
    # characters on a page. Source docs do not specify a numeric threshold.
    ocr_text_density_threshold: int = _int("OCR_TEXT_DENSITY_THRESHOLD", 80)

    # Example range from Story 2.3 AC3 / 06_backend_epics_and_stories.md.
    chunk_token_target_min: int = _int("CHUNK_TOKEN_TARGET_MIN", 200)
    chunk_token_target_max: int = _int("CHUNK_TOKEN_TARGET_MAX", 500)

    postgres_host: str = os.getenv("POSTGRES_HOST", "localhost")
    postgres_port: str = os.getenv("POSTGRES_PORT", "5432")
    postgres_db: str = os.getenv("POSTGRES_DB", "intellidoc")
    postgres_user: str = os.getenv("POSTGRES_USER", "postgres")
    postgres_password: str = os.getenv("POSTGRES_PASSWORD", "postgres")

    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_bucket: str = os.getenv("MINIO_BUCKET", "intellidoc")

    celery_broker_url: str = os.getenv(
        "CELERY_BROKER_URL",
        os.getenv("REDIS_URL", "redis://localhost:6379/0"),
    )
    celery_task_always_eager: bool = _bool("CELERY_TASK_ALWAYS_EAGER", False)

    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    classification_confidence_threshold: float = _float("CLASSIFICATION_CONFIDENCE_THRESHOLD", 0.5)
    llm_max_context_chunks: int = _int("LLM_MAX_CONTEXT_CHUNKS", 50)

    # Story 4.1. Batch size is an assumption in the Epic 4 plan (§27); 32 is the
    # documented default and is tunable per deployment (CPU vs GPU).
    embedding_batch_size: int = _int("EMBEDDING_BATCH_SIZE", 32)
    embedding_model_name: str = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")

    # Story 4.2b. Queries shorter than this stay off the trigram path.
    # ASSUMPTION: 3 keeps 1–2 character strings out of pg_trgm. Not specified in source docs.
    identifier_query_min_length: int = _int("IDENTIFIER_QUERY_MIN_LENGTH", 3)

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
