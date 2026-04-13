import logging

from fastapi import APIRouter, HTTPException

from app.database import get_db
from app.models import OfferResponse
from app.services.agentic_ai import get_agentic_offer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/offer/{user_id}", response_model=OfferResponse)
async def get_offer(user_id: str):
    """Phase 3: Get the AI-selected best offer for a user."""
    db = get_db()
    result = await get_agentic_offer(db, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="No offer available for this user")
    return OfferResponse(**result)


@router.get("/profile/{user_id}")
async def get_profile(user_id: str):
    db = get_db()
    profile = await db.user_profiles.find_one(
        {"userId": user_id}, {"_id": 0, "vectorEmbedding": 0}
    )
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@router.get("/behavior/{user_id}")
async def get_behavior_summary(user_id: str):
    from app.services.behavioral_analysis import summarize_recent_behavior

    db = get_db()
    summary = await summarize_recent_behavior(db, user_id)
    return summary
