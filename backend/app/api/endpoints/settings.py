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

def _mask_value(val: str | None) -> str:
    """Return masked placeholder if value exists, otherwise empty string."""
    return MASK_PLACEHOLDER if val else ""

def _generate_webhook_secret(uid: str) -> str:
    """Generate a unique secure webhook secret matching frontend conventions."""
    random_hex = secrets.token_hex(6) # 12-char hex
    clean_uid = uid.replace("-", "").replace("_", "")[:8]
    return f"bl_wh_{clean_uid}_{random_hex}"

@router.get("", response_model=UserSettingsResponse)
async def get_user_settings(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> Any:
    """Retrieve settings for the authenticated user, creating defaults if missing."""
    uid = current_user["uid"]
    
    settings_doc = await db.user_settings.find_one({"uid": uid})
    
    if not settings_doc:
        # Create default document
        webhook_secret = _generate_webhook_secret(uid)
        settings_doc = {
            "uid": uid,
            "webhook_secret": webhook_secret,
            "github_access_token": "",
            "openai_api_key": "",
            "gemini_api_key": "",
        }
        await db.user_settings.insert_one(settings_doc)
        logger.info("Created default user settings for uid=%s", uid)
        
    return UserSettingsResponse(
        webhook_secret=settings_doc.get("webhook_secret", ""),
        github_access_token=_mask_value(settings_doc.get("github_access_token")),
        openai_api_key=_mask_value(settings_doc.get("openai_api_key")),
        gemini_api_key=_mask_value(settings_doc.get("gemini_api_key")),
    )

@router.post("", response_model=UserSettingsResponse)
async def update_user_settings(
    payload: UserSettingsUpdate,
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> Any:
    """Update settings for the authenticated user."""
    uid = current_user["uid"]
    
    # 1. Fetch existing settings to preserve keys if not modified (sent as masked)
    settings_doc = await db.user_settings.find_one({"uid": uid})
    if not settings_doc:
        # Create fallback settings doc if somehow missing
        webhook_secret = _generate_webhook_secret(uid)
        settings_doc = {
            "uid": uid,
            "webhook_secret": webhook_secret,
            "github_access_token": "",
            "openai_api_key": "",
            "gemini_api_key": "",
        }
        await db.user_settings.insert_one(settings_doc)
        
    # 2. Build set update object
    update_fields: dict[str, str] = {}
    
    # Update GitHub token if modified
    if payload.github_access_token is not None:
        if payload.github_access_token != MASK_PLACEHOLDER:
            update_fields["github_access_token"] = payload.github_access_token
            
    # Update OpenAI Key if modified
    if payload.openai_api_key is not None:
        if payload.openai_api_key != MASK_PLACEHOLDER:
            update_fields["openai_api_key"] = payload.openai_api_key
            
    # Update Gemini Key if modified
    if payload.gemini_api_key is not None:
        if payload.gemini_api_key != MASK_PLACEHOLDER:
            update_fields["gemini_api_key"] = payload.gemini_api_key

    if update_fields:
        await db.user_settings.update_one({"uid": uid}, {"$set": update_fields})
        logger.info("Updated settings keys for uid=%s keys=%s", uid, list(update_fields.keys()))
        # Refresh document
        settings_doc = await db.user_settings.find_one({"uid": uid})
        
    return UserSettingsResponse(
        webhook_secret=settings_doc.get("webhook_secret", ""),
        github_access_token=_mask_value(settings_doc.get("github_access_token")),
        openai_api_key=_mask_value(settings_doc.get("openai_api_key")),
        gemini_api_key=_mask_value(settings_doc.get("gemini_api_key")),
    )
