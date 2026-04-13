import logging
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks

from app.database import get_db
from app.models import TrackRequest, BehavioralEvent
from app.services.behavioral_analysis import (
    detect_friction_points,
    update_user_context,
)
from app.services.agentic_ai import get_agentic_offer
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()

_offer_already_triggered: set = set()


async def _ensure_user_profile(db, user_id: str):
    """CDP Replacement: auto-create and tag new users on first event."""
    existing = await db.user_profiles.find_one({"userId": user_id})
    if not existing:
        profile_doc = {
            "userId": user_id,
            "isNewCX": True,
            "traits": ["new_visitor"],
            "vectorEmbedding": [],
            "currentContext": "",
            "lastOfferServed": "",
        }
        result = await db.user_profiles.insert_one(profile_doc)
        await ws_manager.broadcast({
            "type": "db_log",
            "payload": {
                "event": "new_cx_identified",
                "userId": user_id,
                "collection": "user_profiles",
            },
        })
        await ws_manager.broadcast({
            "type": "doc_write",
            "payload": {
                "collection": "user_profiles",
                "operation": "insertOne",
                "document": {
                    "_id": str(result.inserted_id),
                    "userId": user_id,
                    "isNewCX": True,
                    "traits": ["new_visitor"],
                    "currentContext": "",
                    "lastOfferServed": "",
                },
            },
        })
        logger.info(f"New CX identified and tagged: {user_id}")


async def _post_track_analysis(user_id: str):
    """Background task: detect friction after event ingestion.
    When friction is found, automatically triggers the AI offer pipeline
    so a personalized voucher is pushed to the user via Change Stream.
    """
    db = get_db()
    context = await detect_friction_points(db, user_id)
    if context:
        logger.info(f"Friction detected for {user_id}: {context}")
        await update_user_context(db, user_id, context)

        if user_id not in _offer_already_triggered:
            _offer_already_triggered.add(user_id)
            logger.info(f"Auto-triggering AI offer for {user_id} due to friction")
            try:
                offer = await get_agentic_offer(db, user_id)
                if offer:
                    logger.info(f"AI offer delivered to {user_id}: {offer['offerId']}")
            except Exception as e:
                logger.warning(f"Auto-offer failed for {user_id}: {e}")
                _offer_already_triggered.discard(user_id)


@router.post("/track")
async def track_event(req: TrackRequest, background_tasks: BackgroundTasks):
    db = get_db()

    event = BehavioralEvent(
        timestamp=datetime.utcnow(),
        userId=req.userId,
        sessionId=req.sessionId,
        action=req.action,
        elementId=req.elementId,
        metadata=req.metadata,
    )
    doc = event.model_dump()
    await db.behavioral_events.insert_one(doc)

    await ws_manager.broadcast({
        "type": "db_log",
        "payload": {
            "event": "event_ingested",
            "action": req.action,
            "userId": req.userId,
            "elementId": req.elementId,
            "page": req.metadata.page,
            "collection": "behavioral_events",
        },
    })

    await ws_manager.broadcast({
        "type": "doc_write",
        "payload": {
            "collection": "behavioral_events",
            "operation": "insertOne",
            "document": {
                "_id": str(doc.get("_id", "")),
                "timestamp": doc["timestamp"].isoformat() + "Z",
                "userId": doc["userId"],
                "sessionId": doc["sessionId"],
                "action": doc["action"],
                "elementId": doc["elementId"],
                "metadata": {
                    "page": doc["metadata"]["page"],
                    "value": doc["metadata"].get("value"),
                },
            },
        },
    })

    await _ensure_user_profile(db, req.userId)

    background_tasks.add_task(_post_track_analysis, req.userId)

    return {"status": "ok", "eventId": str(doc.get("_id", ""))}
