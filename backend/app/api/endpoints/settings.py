"""
User Settings endpoints for BugLens.

Routes
------
GET  /api/v1/settings   – Retrieve settings (masked values returned for keys)
POST /api/v1/settings   – Create or update settings for the authenticated user

DB Schema (user_settings collection)
-------------------------------------
{
    "uid":                   str,   # Firebase UID — primary lookup key
    "webhook_secret":        str,   # Legacy display identifier (bl_wh_<uid>_<hex>)
    "github_webhook_secret": str,   # 32-char hex — used for HMAC-SHA256 signature verification
    "github_access_token":   str,
    "openai_api_key":        str,
    "gemini_api_key":        str,
}
"""

import logging
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.mongo import get_mongo_db
from app.api.dependencies.auth import get_firebase_user
from app.schemas.settings import UserSettingsResponse, UserSettingsUpdate

logger = logging.getLogger(__name__)

router = APIRouter()

MASK_PLACEHOLDER = "••••••••••••••••••••••••"


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _mask_value(val: str | None) -> str:
    """Return masked placeholder if value is non-empty, otherwise empty string."""
    return MASK_PLACEHOLDER if val else ""


def _generate_display_secret(uid: str) -> str:
    """Generate a short, human-readable webhook identifier.

    Format: ``bl_wh_<8-char uid>_<12-char hex>``
    Used on the Settings page as a display label so users know which webhook
    belongs to them without exposing the raw HMAC secret.
    """
    random_hex = secrets.token_hex(6)        # 12-char hex
    clean_uid = uid.replace("-", "").replace("_", "")[:8]
    return f"bl_wh_{clean_uid}_{random_hex}"


def generate_webhook_secret() -> str:
    """Generate a cryptographically secure 32-byte (64-char hex) webhook secret.

    This is the value registered inside GitHub → Repository → Settings → Webhooks
    as the *Secret* field.  GitHub will HMAC-SHA256 each payload with this secret
    and attach the digest in the ``X-Hub-Signature-256`` header so BugLens can
    verify authenticity.
    """
    return secrets.token_hex(32)   # 32 bytes → 64-char hex string


def _build_default_settings(uid: str) -> dict:
    """Return a fresh settings document for a first-time user."""
    return {
        "uid": uid,
        "webhook_secret": _generate_display_secret(uid),    # display label
        "github_webhook_secret": generate_webhook_secret(), # HMAC secret
        "github_access_token": "",
        "openai_api_key": "",
        "gemini_api_key": "",
    }


# ---------------------------------------------------------------------------
# GET /  — retrieve settings
# ---------------------------------------------------------------------------

@router.get("", response_model=UserSettingsResponse)
async def get_user_settings(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> Any:
    """Retrieve settings for the authenticated user, creating defaults if missing."""
    uid = current_user["uid"]

    settings_doc = await db.user_settings.find_one({"uid": uid})

    if not settings_doc:
        settings_doc = _build_default_settings(uid)
        await db.user_settings.insert_one(settings_doc)
        logger.info("Created default user settings for uid=%s", uid)

    # Back-fill github_webhook_secret for documents created before this field existed
    if not settings_doc.get("github_webhook_secret"):
        new_secret = generate_webhook_secret()
        await db.user_settings.update_one(
            {"uid": uid},
            {"$set": {"github_webhook_secret": new_secret}},
        )
        settings_doc["github_webhook_secret"] = new_secret
        logger.info("Back-filled github_webhook_secret for uid=%s", uid)

    return UserSettingsResponse(
        webhook_secret=settings_doc.get("webhook_secret", ""),
        github_webhook_secret=settings_doc.get("github_webhook_secret", ""),
        github_access_token=_mask_value(settings_doc.get("github_access_token")),
        openai_api_key=_mask_value(settings_doc.get("openai_api_key")),
        gemini_api_key=_mask_value(settings_doc.get("gemini_api_key")),
    )


# ---------------------------------------------------------------------------
# POST /  — update settings
# ---------------------------------------------------------------------------

@router.post("", response_model=UserSettingsResponse)
async def update_user_settings(
    payload: UserSettingsUpdate,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> Any:
    """Create or update settings for the authenticated user.

    Masked values (``••••••••••••••••••••••••``) are ignored — only real new
    values overwrite the stored credential.
    """
    uid = current_user["uid"]

    settings_doc = await db.user_settings.find_one({"uid": uid})
    if not settings_doc:
        settings_doc = _build_default_settings(uid)
        await db.user_settings.insert_one(settings_doc)
        logger.info("Auto-created settings for uid=%s during update", uid)

    # Back-fill github_webhook_secret for legacy documents
    if not settings_doc.get("github_webhook_secret"):
        settings_doc["github_webhook_secret"] = generate_webhook_secret()

    # Build update payload — skip masked/unchanged fields
    update_fields: dict[str, str] = {}

    for field in ("github_access_token", "openai_api_key", "gemini_api_key"):
        value = getattr(payload, field, None)
        if value is not None and value != MASK_PLACEHOLDER:
            update_fields[field] = value

    # Allow the user to explicitly rotate their own webhook secret
    if payload.github_webhook_secret is not None and payload.github_webhook_secret != MASK_PLACEHOLDER:
        update_fields["github_webhook_secret"] = payload.github_webhook_secret

    # Ensure github_webhook_secret is persisted if it was just back-filled
    if "github_webhook_secret" not in update_fields and not settings_doc.get("github_webhook_secret"):
        update_fields["github_webhook_secret"] = settings_doc["github_webhook_secret"]

    if update_fields:
        await db.user_settings.update_one({"uid": uid}, {"$set": update_fields})
        logger.info("Updated settings for uid=%s | keys=%s", uid, list(update_fields.keys()))
        settings_doc = await db.user_settings.find_one({"uid": uid})

    return UserSettingsResponse(
        webhook_secret=settings_doc.get("webhook_secret", ""),
        github_webhook_secret=settings_doc.get("github_webhook_secret", ""),
        github_access_token=_mask_value(settings_doc.get("github_access_token")),
        openai_api_key=_mask_value(settings_doc.get("openai_api_key")),
        gemini_api_key=_mask_value(settings_doc.get("gemini_api_key")),
    )
