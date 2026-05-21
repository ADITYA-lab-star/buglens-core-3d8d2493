"""
Dashboard Analytics & History endpoints for BugLens.

Routes
------
GET /api/v1/dashboard/stats   – Aggregated review statistics.
GET /api/v1/dashboard/recent  – The 5 most recent review records.
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.review import Review

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def _review_to_dict(review: Review) -> dict[str, Any]:
    """Serialize a Review ORM object to a plain dict for the API response."""
    return {
        "id": review.id,
        "repository_name": review.repository_name,
        "file_name": review.file_name,
        "ai_model_used": review.ai_model_used,
        "severity_level": review.severity_level,
        "review_result": review.review_result,
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/stats", response_model=dict)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return aggregated statistics across all reviews.

    Fields returned
    ---------------
    total_reviews_count   : int  – Total number of reviews in the database.
    critical_bugs_caught  : int  – Reviews whose severity_level is "critical".
    average_response_time : float – Mocked at 1.8 s until a timing column exists.
    """
    # Total reviews
    total_result = await db.execute(select(func.count()).select_from(Review))
    total_reviews: int = total_result.scalar_one() or 0

    # Critical-severity reviews
    critical_result = await db.execute(
        select(func.count())
        .select_from(Review)
        .where(func.lower(Review.severity_level) == "critical")
    )
    critical_bugs: int = critical_result.scalar_one() or 0

    logger.info(
        "Dashboard stats: total=%d critical=%d", total_reviews, critical_bugs
    )

    return {
        "total_reviews_count": total_reviews,
        "critical_bugs_caught": critical_bugs,
        # Mocked until a response_time_ms column is added to the Review model.
        "average_response_time": 1.8,
    }


@router.get("/recent", response_model=list)
async def get_recent_reviews(db: AsyncSession = Depends(get_db)) -> list[dict[str, Any]]:
    """Return the 5 most recently created reviews, newest first.

    The Review model does not yet have a ``created_at`` timestamp column, so
    we fall back to ordering by ``id`` descending, which is monotonically
    increasing and effectively equivalent for a single-node database.
    """
    result = await db.execute(
        select(Review).order_by(Review.id.desc()).limit(5)
    )
    reviews = result.scalars().all()

    logger.info("Returning %d recent reviews", len(reviews))
    return [_review_to_dict(r) for r in reviews]
