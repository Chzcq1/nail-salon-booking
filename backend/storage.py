"""
Object storage backend — Cloudflare R2 and any S3-compatible API.

Required env vars (set via Render Dashboard or Replit Secrets):
  S3_ENDPOINT_URL       — https://<account>.r2.cloudflarestorage.com  (R2)
                          or https://s3.<region>.amazonaws.com          (AWS)
  S3_BUCKET_NAME        — bucket name
  S3_ACCESS_KEY_ID      — R2 Access Key ID / AWS Access Key
  S3_SECRET_ACCESS_KEY  — R2 Secret / AWS Secret Access Key
  S3_PUBLIC_URL         — public base URL serving the bucket
                          e.g. https://pub.example.com  (R2 custom domain)
                               https://<bucket>.s3.<region>.amazonaws.com
  S3_REGION             — "auto" for R2, "us-east-1" for AWS (default: auto)

If none of these are set the module degrades gracefully:
  • is_configured() returns False
  • upload_bytes() raises RuntimeError (caller must handle / fallback)
  • delete_url() is a no-op
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

# MIME → file extension map
_MIME_EXT: dict[str, str] = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


# ── Lazy boto3 import (avoids hard dep when storage is unused) ────────────────

_boto3_mod = None


def _boto3():
    global _boto3_mod
    if _boto3_mod is None:
        try:
            import boto3  # type: ignore
            _boto3_mod = boto3
        except ImportError as exc:
            raise RuntimeError(
                "boto3 is required for object storage. "
                "Add 'boto3' to requirements.txt and reinstall."
            ) from exc
    return _boto3_mod


# ── Settings helper ───────────────────────────────────────────────────────────

def _cfg():
    from backend.config import get_settings
    return get_settings()


# ── Public API ────────────────────────────────────────────────────────────────

def is_configured() -> bool:
    """Return True when all required S3/R2 environment variables are present."""
    s = _cfg()
    return bool(
        s.s3_endpoint_url
        and s.s3_bucket_name
        and s.s3_access_key_id
        and s.s3_secret_access_key
        and s.s3_public_url
    )


def _client():
    s = _cfg()
    return _boto3().client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        aws_access_key_id=s.s3_access_key_id,
        aws_secret_access_key=s.s3_secret_access_key,
        region_name=s.s3_region or "auto",
    )


def upload_bytes(
    data: bytes,
    content_type: str,
    folder: str = "uploads",
    extension: str = ".jpg",
) -> str:
    """
    Upload raw bytes to object storage.

    Args:
        data         — raw image bytes
        content_type — MIME type, e.g. "image/jpeg"
        folder       — storage prefix (no leading/trailing slash)
        extension    — file extension including dot, e.g. ".jpg"

    Returns:
        Public HTTPS URL of the uploaded object.

    Raises:
        RuntimeError if storage is not configured or upload fails.
    """
    if not is_configured():
        raise RuntimeError("Object storage is not configured (S3_* env vars missing)")

    s = _cfg()
    key = f"{folder.strip('/')}/{uuid.uuid4().hex}{extension}"

    _client().put_object(
        Bucket=s.s3_bucket_name,
        Key=key,
        Body=data,
        ContentType=content_type,
        # Note: do NOT set ACL here — R2 manages public access at bucket level
    )

    public_url = f"{s.s3_public_url.rstrip('/')}/{key}"
    logger.info("Uploaded %d bytes → %s", len(data), public_url)
    return public_url


def _key_from_url(url: str) -> Optional[str]:
    """Extract the S3 object key from one of our public URLs. Returns None if unrecognised."""
    s = _cfg()
    base = (s.s3_public_url or "").rstrip("/")
    if not base:
        return None
    url = url.strip()
    if url.startswith(base + "/"):
        return url[len(base) + 1:]
    return None


def delete_url(url: str) -> None:
    """
    Delete an object from storage by its public URL.

    Silent no-op when:
    • storage is not configured
    • URL is empty / not an HTTPS URL
    • URL does not match our S3_PUBLIC_URL prefix (external URL — never touch it)
    """
    if not url or not url.startswith("https://"):
        return
    if not is_configured():
        return
    key = _key_from_url(url)
    if not key:
        logger.debug("delete_url: URL not from our storage, skip: %s", url[:80])
        return
    s = _cfg()
    try:
        _client().delete_object(Bucket=s.s3_bucket_name, Key=key)
        logger.info("Deleted storage object: %s", key)
    except Exception as exc:
        # Log and continue — a failed delete should never break user-facing flows
        logger.warning("delete_url failed for key=%s: %s", key, exc)


def delete_urls(urls: list[str]) -> None:
    """Convenience wrapper to batch-delete a list of public URLs."""
    for url in urls:
        delete_url(url)


def mime_and_ext(header: str) -> tuple[str, str]:
    """
    Derive MIME type and file extension from a base64 data URI header.

    Example: "data:image/png;base64" → ("image/png", ".png")
    """
    mime = "image/jpeg"
    if "png" in header:
        mime = "image/png"
    elif "gif" in header:
        mime = "image/gif"
    elif "webp" in header:
        mime = "image/webp"
    return mime, _MIME_EXT.get(mime, ".jpg")
