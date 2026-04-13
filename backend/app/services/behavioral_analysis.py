from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)


async def detect_friction_points(db: AsyncIOMotorDatabase, user_id: str) -> Optional[str]:
    """
    Detect friction in two passes:
    1. Per-element: 3+ friction events on the same element (strong signal)
    2. Per-page: 3+ friction events across any elements on the same page
       (catches users hesitating on different parts of the same page)
    """
    settings = get_settings()
    cutoff = datetime.utcnow() - timedelta(seconds=settings.friction_window_seconds)

    base_match = {
        "$match": {
            "userId": user_id,
            "timestamp": {"$gte": cutoff},
            "action": {"$in": ["hesitation", "dwell", "rage_click"]},
        }
    }

    element_pipeline = [
        base_match,
        {
            "$group": {
                "_id": {"elementId": "$elementId", "page": "$metadata.page"},
                "count": {"$sum": 1},
                "actions": {"$push": "$action"},
                "lastValue": {"$last": "$metadata.value"},
            }
        },
        {"$match": {"count": {"$gte": settings.friction_threshold}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]

    results = await db.behavioral_events.aggregate(element_pipeline).to_list(1)
    if results:
        hit = results[0]
        element = hit["_id"]["elementId"]
        page = hit["_id"]["page"]
        count = hit["count"]
        actions = hit["actions"]
        value = hit.get("lastValue", "")
        context = (
            f"User is struggling on page '{page}' — "
            f"{count} friction events ({', '.join(actions)}) on element '{element}'"
        )
        if value:
            context += f" while viewing '{value}'"
        return context

    page_pipeline = [
        base_match,
        {
            "$group": {
                "_id": "$metadata.page",
                "count": {"$sum": 1},
                "elements": {"$addToSet": "$elementId"},
                "actions": {"$push": "$action"},
                "lastValue": {"$last": "$metadata.value"},
            }
        },
        {"$match": {"count": {"$gte": settings.friction_threshold}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]

    results = await db.behavioral_events.aggregate(page_pipeline).to_list(1)
    if results:
        hit = results[0]
        page = hit["_id"]
        count = hit["count"]
        elements = hit["elements"][:3]
        actions = hit["actions"]
        value = hit.get("lastValue", "")
        context = (
            f"User is struggling on page '{page}' — "
            f"{count} friction events ({', '.join(actions)}) across elements: {', '.join(elements)}"
        )
        if value:
            context += f" while viewing '{value}'"
        return context

    return None


async def summarize_recent_behavior(db: AsyncIOMotorDatabase, user_id: str) -> dict:
    """
    Multi-stage aggregation pipeline that summarizes recent user behavior
    for the LLM context window.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=10)

    pipeline = [
        {"$match": {"userId": user_id, "timestamp": {"$gte": cutoff}}},
        {"$sort": {"timestamp": -1}},
        {"$limit": 100},
        {
            "$facet": {
                "actionBreakdown": [
                    {"$group": {"_id": "$action", "count": {"$sum": 1}}}
                ],
                "topPages": [
                    {"$group": {"_id": "$metadata.page", "visits": {"$sum": 1}}},
                    {"$sort": {"visits": -1}},
                    {"$limit": 5},
                ],
                "topElements": [
                    {"$group": {"_id": "$elementId", "interactions": {"$sum": 1}}},
                    {"$sort": {"interactions": -1}},
                    {"$limit": 5},
                ],
                "recentEvents": [
                    {"$limit": 10},
                    {
                        "$project": {
                            "_id": 0,
                            "action": 1,
                            "elementId": 1,
                            "metadata": 1,
                            "timestamp": 1,
                        }
                    },
                ],
                "sessionInfo": [
                    {
                        "$group": {
                            "_id": None,
                            "totalEvents": {"$sum": 1},
                            "uniquePages": {"$addToSet": "$metadata.page"},
                            "firstEvent": {"$min": "$timestamp"},
                            "lastEvent": {"$max": "$timestamp"},
                        }
                    }
                ],
            }
        },
    ]

    results = await db.behavioral_events.aggregate(pipeline).to_list(1)
    if not results:
        return {"totalEvents": 0}

    summary = results[0]
    session = summary.get("sessionInfo", [{}])
    session_info = session[0] if session else {}

    return {
        "totalEvents": session_info.get("totalEvents", 0),
        "uniquePages": session_info.get("uniquePages", []),
        "durationSeconds": (
            (session_info["lastEvent"] - session_info["firstEvent"]).total_seconds()
            if session_info.get("firstEvent") and session_info.get("lastEvent")
            else 0
        ),
        "actionBreakdown": {
            r["_id"]: r["count"] for r in summary.get("actionBreakdown", [])
        },
        "topPages": [
            {"page": r["_id"], "visits": r["visits"]}
            for r in summary.get("topPages", [])
        ],
        "topElements": [
            {"element": r["_id"], "interactions": r["interactions"]}
            for r in summary.get("topElements", [])
        ],
        "recentEvents": summary.get("recentEvents", []),
    }


async def update_user_context(
    db: AsyncIOMotorDatabase, user_id: str, context: str
):
    """Update the user profile with the detected context."""
    await db.user_profiles.update_one(
        {"userId": user_id},
        {"$set": {"currentContext": context}},
        upsert=True,
    )
    await ws_manager.broadcast({
        "type": "db_log",
        "payload": {
            "event": "context_updated",
            "userId": user_id,
            "context": context,
            "collection": "user_profiles",
        },
    })
    await ws_manager.broadcast({
        "type": "doc_write",
        "payload": {
            "collection": "user_profiles",
            "operation": "updateOne",
            "filter": {"userId": user_id},
            "update": {"$set": {"currentContext": context}},
        },
    })
