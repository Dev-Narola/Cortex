"""
S3 implementation of the ObjectStorage interface.
"""

from __future__ import annotations

from typing import BinaryIO

import boto3
from botocore.exceptions import ClientError

from src.ingestion.infrastructure.storage import (
    ObjectNotFoundError,
    ObjectStorage,
)


def generate_document_uri(tenant_id: str, document_id: str, filename: str) -> str:
    """
    Generate a tenant-scoped storage key for a document.
    Format: tenants/{tenant_id}/documents/{document_id}/original/{filename}
    """
    return f"tenants/{tenant_id}/documents/{document_id}/original/{filename}"


class S3Storage(ObjectStorage):
    """
    AWS S3 (and S3-compatible, e.g., MinIO) implementation of ObjectStorage.
    """

    def __init__(
        self,
        bucket: str,
        endpoint_url: str | None = None,
        region_name: str | None = None,
        aws_access_key_id: str | None = None,
        aws_secret_access_key: str | None = None,
    ) -> None:
        if not bucket:
            raise ValueError("bucket name must be provided")

        self.bucket = bucket

        client_kwargs = {}
        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url
        if region_name:
            client_kwargs["region_name"] = region_name
        if aws_access_key_id:
            client_kwargs["aws_access_key_id"] = aws_access_key_id
        if aws_secret_access_key:
            client_kwargs["aws_secret_access_key"] = aws_secret_access_key

        self.client = boto3.client("s3", **client_kwargs)

    def upload(
        self,
        *,
        uri: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
    ) -> str:
        if not isinstance(uri, str) or not uri:
            raise ValueError("uri must be a non-empty string")

        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        if isinstance(data, bytes):
            self.client.put_object(
                Bucket=self.bucket,
                Key=uri,
                Body=data,
                **extra_args,
            )
        else:
            self.client.upload_fileobj(
                data,
                self.bucket,
                uri,
                ExtraArgs=extra_args if extra_args else None,
            )

        return f"s3://{self.bucket}/{uri}"

    def _resolve_key(self, uri: str) -> str:
        """Strip the s3://bucket/ prefix from a URI if present to get the raw key."""
        if uri.startswith("s3://"):
            # Format: s3://bucket/key...
            parts = uri.split("/", 3)
            if len(parts) >= 4:
                return parts[3]
        return uri

    def delete(self, uri: str) -> bool:
        key = self._resolve_key(uri)
        if not self.exists(key):
            return False

        self.client.delete_object(Bucket=self.bucket, Key=key)
        return True

    def exists(self, uri: str) -> bool:
        key = self._resolve_key(uri)
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "404":
                return False
            raise

    def download(self, uri: str) -> bytes:
        key = self._resolve_key(uri)
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            return response["Body"].read()
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "NoSuchKey":
                raise ObjectNotFoundError(uri=uri) from e
            raise
