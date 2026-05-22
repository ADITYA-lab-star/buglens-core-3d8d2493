"""
Dashboard Analytics & History endpoints for BugLens.

Routes
------
GET /api/v1/dashboard/stats   – Aggregated review statistics via MongoDB pipeline.
GET /api/v1/dashboard/recent  – The 5 most recent review records.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.mongo import get_mongo_db
from app.api.dependencies.auth import get_firebase_user

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _start_of_current_month() -> datetime:
    """Return a timezone-aware datetime for the first instant of this month (UTC)."""
    now = datetime.now(tz=timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _review_to_dict(review: dict) -> dict[str, Any]:
    """Serialize a MongoDB review document to the API response format.

    The ``status`` field defaults to ``'completed'`` because the reviews
    collection only persists successful reviews; a ``'failed'`` status is
    stored explicitly when a review write was attempted but partially failed.
    """
    return {
        "id": str(review.get("_id")),
        "repository_name": review.get("repository_name", "unknown"),
        "file_name": review.get("file_name", "unknown"),
        "ai_model_used": review.get("ai_model_used", "unknown"),
        "severity_level": review.get("severity_level", "info"),
        "language": review.get("language", "unknown"),
        "status": review.get("status", "completed"),
        "review_result": review.get("metadataJson", {}),
    }


# ---------------------------------------------------------------------------
# GET /stats  — aggregation pipeline
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=dict)
async def get_dashboard_stats(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> dict[str, Any]:
    """Return aggregated statistics for the authenticated user.

    Uses a single MongoDB aggregation pipeline per metric group so the entire
    computation is pushed to the database engine rather than fetched and
    counted in Python.

    Fields returned
    ---------------
    total_reviews_count    : int   — All-time reviews for this user.
    monthly_reviews_count  : int   — Reviews created in the current calendar month.
    critical_bugs_caught   : int   — Reviews where severity_level == "critical".
    average_response_time  : float — Mean of response_time_ms (in seconds), or 0.0
                                     if the field has not been populated yet.
    severity_breakdown     : dict  — Count per severity level (info/low/medium/high/critical).
    """
    uid = current_user["uid"]
    month_start = _start_of_current_month()

    # ── Pipeline 1: all-time totals + severity breakdown ──────────────────────
    all_time_pipeline = [
        {"$match": {"uid": uid}},
        {
            "$group": {
                "_id": None,
                "total": {"$sum": 1},
                "critical": {
                    "$sum": {"$cond": [{"$eq": ["$severity_level", "critical"]}, 1, 0]}
                },
                "high": {
                    "$sum": {"$cond": [{"$eq": ["$severity_level", "high"]}, 1, 0]}
                },
                "medium": {
                    "$sum": {"$cond": [{"$eq": ["$severity_level", "medium"]}, 1, 0]}
                },
                "low": {
                    "$sum": {"$cond": [{"$eq": ["$severity_level", "low"]}, 1, 0]}
                },
                "info": {
                    "$sum": {"$cond": [{"$eq": ["$severity_level", "info"]}, 1, 0]}
                },
                # avg response_time_ms — only averages documents that have the field set
                "avg_response_ms": {
                    "$avg": {
                        "$cond": [
                            {"$gt": [{"$ifNull": ["$response_time_ms", None]}, None]},
                            "$response_time_ms",
                            None,
                        ]
                    }
                },
            }
        },
    ]

    # ── Pipeline 2: monthly count ──────────────────────────────────────────────
    # MongoDB _id is an ObjectId whose first 4 bytes encode a Unix timestamp,
    # so we can filter by insertion time without a separate `created_at` field.
    monthly_pipeline = [
        {
            "$match": {
                "uid": uid,
                # Convert ObjectId creation time >= month_start
                "$expr": {
                    "$gte": [
                        {"$toDate": "$_id"},
                        {"$toDate": month_start.isoformat()},
                    ]
                },
            }
        },
        {"$count": "monthly"},
    ]

    try:
        all_time_cursor = db.reviews.aggregate(all_time_pipeline)
        all_time_results = await all_time_cursor.to_list(length=1)

        monthly_cursor = db.reviews.aggregate(monthly_pipeline)
        monthly_results = await monthly_cursor.to_list(length=1)
    except Exception as exc:
        logger.exception("Dashboard aggregation failed for uid=%s", uid)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Aggregation failed: {exc}",
        )

    # Unpack results — both aggregations return [] when there are no documents
    agg = all_time_results[0] if all_time_results else {}
    monthly_count = monthly_results[0].get("monthly", 0) if monthly_results else 0

    avg_ms = agg.get("avg_response_ms")
    avg_seconds = round(avg_ms / 1000, 2) if avg_ms else 0.0

    logger.info(
        "Dashboard stats uid=%s: total=%d monthly=%d critical=%d avg_ms=%s",
        uid,
        agg.get("total", 0),
        monthly_count,
        agg.get("critical", 0),
        avg_ms,
    )

    return {
        "total_reviews_count": agg.get("total", 0),
        "monthly_reviews_count": monthly_count,
        "critical_bugs_caught": agg.get("critical", 0),
        "average_response_time": avg_seconds,
        "severity_breakdown": {
            "critical": agg.get("critical", 0),
            "high": agg.get("high", 0),
            "medium": agg.get("medium", 0),
            "low": agg.get("low", 0),
            "info": agg.get("info", 0),
        },
    }


# ---------------------------------------------------------------------------
# GET /recent  — 5 most recent reviews
# ---------------------------------------------------------------------------

@router.get("/recent", response_model=list)
async def get_recent_reviews(
    db: AsyncIOMotorDatabase = Depends(get_mongo_db),
    current_user: dict = Depends(get_firebase_user),
) -> list[dict[str, Any]]:
    """Return the 5 most recently created reviews for the authenticated user.

    Sorted by ``_id`` descending — MongoDB ObjectIds embed a creation
    timestamp in their first 4 bytes, so this is equivalent to
    ``ORDER BY created_at DESC`` without a separate timestamp column.
    """
    uid = current_user["uid"]

    cursor = db.reviews.find({"uid": uid}).sort("_id", -1).limit(5)
    reviews = await cursor.to_list(length=5)

    logger.info("Returning %d recent reviews for uid=%s", len(reviews), uid)
    return [_review_to_dict(r) for r in reviews]
