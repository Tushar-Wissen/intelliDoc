"""Python MinIO reader. Same bucket/path convention as Core API:

workspace/{workspaceId}/document/{documentId}/original.{ext}
"""

from __future__ import annotations

from urllib.parse import urlparse

from minio import Minio

from app.config import settings


class MinioReadError(RuntimeError):
    pass


def _client_from_endpoint(endpoint: str, access_key: str, secret_key: str) -> Minio:
    parsed = urlparse(endpoint if "://" in endpoint else f"http://{endpoint}")
    host = parsed.netloc or parsed.path
    secure = parsed.scheme == "https"
    return Minio(host, access_key=access_key, secret_key=secret_key, secure=secure)


class MinioStorage:
    def __init__(
        self,
        endpoint: str | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        bucket: str | None = None,
        client: Minio | None = None,
    ) -> None:
        self.bucket = bucket or settings.minio_bucket
        self._client = client or _client_from_endpoint(
            endpoint or settings.minio_endpoint,
            access_key or settings.minio_access_key,
            secret_key or settings.minio_secret_key,
        )

    def get_bytes(self, object_path: str) -> bytes:
        try:
            response = self._client.get_object(self.bucket, object_path)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        except Exception as exc:
            raise MinioReadError(f"Failed to read {object_path}") from exc


_default: MinioStorage | None = None


def get_minio() -> MinioStorage:
    global _default
    if _default is None:
        _default = MinioStorage()
    return _default


def set_minio(storage: MinioStorage | object | None) -> None:
    global _default
    _default = storage
