"""
Unit tests for the S3Storage adapter.
"""
import io
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from src.ingestion.infrastructure.s3_storage import (
    S3Storage,
    generate_document_uri,
)
from src.ingestion.infrastructure.storage import ObjectNotFoundError


def test_generate_document_uri():
    uri = generate_document_uri(
        tenant_id="tenant-123",
        document_id="doc-456",
        filename="report.pdf"
    )
    assert uri == "tenants/tenant-123/documents/doc-456/original/report.pdf"


@pytest.fixture
def mock_boto_client():
    with patch("src.ingestion.infrastructure.s3_storage.boto3.client") as mock_client:
        yield mock_client.return_value


@pytest.fixture
def s3_storage(mock_boto_client):
    return S3Storage(bucket="test-bucket", region_name="us-east-1")


def test_s3_storage_requires_bucket():
    with pytest.raises(ValueError, match="bucket name must be provided"):
        S3Storage(bucket="")


def test_upload_bytes(s3_storage, mock_boto_client):
    uri = "test/uri"
    data = b"test content"

    result = s3_storage.upload(uri=uri, data=data, content_type="text/plain")

    assert result == f"s3://test-bucket/{uri}"
    mock_boto_client.put_object.assert_called_once_with(
        Bucket="test-bucket",
        Key=uri,
        Body=data,
        ContentType="text/plain",
    )


def test_upload_fileobj(s3_storage, mock_boto_client):
    uri = "test/uri"
    data = io.BytesIO(b"test content")

    result = s3_storage.upload(uri=uri, data=data)

    assert result == f"s3://test-bucket/{uri}"
    mock_boto_client.upload_fileobj.assert_called_once_with(
        data,
        "test-bucket",
        uri,
        ExtraArgs=None,
    )


def test_upload_rejects_empty_uri(s3_storage):
    with pytest.raises(ValueError, match="uri must be a non-empty string"):
        s3_storage.upload(uri="", data=b"data")


def test_delete_existing(s3_storage, mock_boto_client):
    # Mock exists to return True (head_object doesn't raise)
    mock_boto_client.head_object.return_value = {}
    
    result = s3_storage.delete("test/uri")
    
    assert result is True
    mock_boto_client.delete_object.assert_called_once_with(Bucket="test-bucket", Key="test/uri")


def test_delete_non_existing(s3_storage, mock_boto_client):
    # Mock exists to return False
    error_response = {'Error': {'Code': '404', 'Message': 'Not Found'}}
    mock_boto_client.head_object.side_effect = ClientError(error_response, 'HeadObject')
    
    result = s3_storage.delete("test/uri")
    
    assert result is False
    mock_boto_client.delete_object.assert_not_called()


def test_exists_true(s3_storage, mock_boto_client):
    mock_boto_client.head_object.return_value = {}
    assert s3_storage.exists("test/uri") is True


def test_exists_false(s3_storage, mock_boto_client):
    error_response = {'Error': {'Code': '404', 'Message': 'Not Found'}}
    mock_boto_client.head_object.side_effect = ClientError(error_response, 'HeadObject')
    assert s3_storage.exists("test/uri") is False


def test_exists_raises_other_errors(s3_storage, mock_boto_client):
    error_response = {'Error': {'Code': '500', 'Message': 'Internal Error'}}
    mock_boto_client.head_object.side_effect = ClientError(error_response, 'HeadObject')
    with pytest.raises(ClientError):
        s3_storage.exists("test/uri")


def test_download_success(s3_storage, mock_boto_client):
    mock_body = MagicMock()
    mock_body.read.return_value = b"file data"
    mock_boto_client.get_object.return_value = {"Body": mock_body}
    
    result = s3_storage.download("test/uri")
    
    assert result == b"file data"
    mock_boto_client.get_object.assert_called_once_with(Bucket="test-bucket", Key="test/uri")


def test_download_not_found(s3_storage, mock_boto_client):
    error_response = {'Error': {'Code': 'NoSuchKey', 'Message': 'Not Found'}}
    mock_boto_client.get_object.side_effect = ClientError(error_response, 'GetObject')
    
    with pytest.raises(ObjectNotFoundError) as exc:
        s3_storage.download("test/uri")
    
    assert exc.value.data["uri"] == "test/uri"
