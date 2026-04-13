from __future__ import annotations

from fastapi import APIRouter
from app.database import get_db

router = APIRouter()


@router.get("/analytics")
async def get_analytics():
    db = get_db()

    events_by_action = await db.behavioral_events.aggregate([
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)

    events_by_user = await db.behavioral_events.aggregate([
        {"$group": {"_id": "$userId", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)

    events_by_page = await db.behavioral_events.aggregate([
        {"$group": {"_id": "$metadata.page", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)

    friction_by_user = await db.behavioral_events.aggregate([
        {"$match": {"action": {"$in": ["hesitation", "rage_click", "dwell"]}}},
        {"$group": {
            "_id": "$userId",
            "hesitation": {"$sum": {"$cond": [{"$eq": ["$action", "hesitation"]}, 1, 0]}},
            "rage_click": {"$sum": {"$cond": [{"$eq": ["$action", "rage_click"]}, 1, 0]}},
            "dwell": {"$sum": {"$cond": [{"$eq": ["$action", "dwell"]}, 1, 0]}},
            "total": {"$sum": 1},
        }},
        {"$sort": {"total": -1}},
    ]).to_list(20)

    friction_by_element = await db.behavioral_events.aggregate([
        {"$match": {"action": {"$in": ["hesitation", "rage_click", "dwell"]}}},
        {"$group": {"_id": "$elementId", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]).to_list(10)

    user_intent = await db.behavioral_events.aggregate([
        {"$group": {
            "_id": {"userId": "$userId", "page": "$metadata.page"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"count": -1}},
        {"$group": {
            "_id": "$_id.userId",
            "topPage": {"$first": "$_id.page"},
            "topPageEvents": {"$first": "$count"},
            "totalPages": {"$sum": 1},
        }},
        {"$sort": {"topPageEvents": -1}},
    ]).to_list(20)

    profiles = await db.user_profiles.find(
        {}, {"_id": 0, "vectorEmbedding": 0}
    ).to_list(50)

    new_vs_returning = {"new": 0, "returning": 0}
    for p in profiles:
        if p.get("isNewCX"):
            new_vs_returning["new"] += 1
        else:
            new_vs_returning["returning"] += 1

    offers_served = await db.user_profiles.aggregate([
        {"$match": {"lastOfferServed": {"$ne": ""}}},
        {"$group": {"_id": "$lastOfferServed", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]).to_list(20)

    hourly_events = await db.behavioral_events.aggregate([
        {"$group": {
            "_id": {"$hour": "$timestamp"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]).to_list(24)

    total_events = await db.behavioral_events.count_documents({})
    total_users = await db.user_profiles.count_documents({})
    total_offers = await db.marketing_offers.count_documents({})
    total_friction = await db.behavioral_events.count_documents(
        {"action": {"$in": ["hesitation", "rage_click", "dwell"]}}
    )

    return {
        "summary": {
            "totalEvents": total_events,
            "totalUsers": total_users,
            "totalOffers": total_offers,
            "totalFriction": total_friction,
            "frictionRate": round(total_friction / max(total_events, 1) * 100, 1),
        },
        "eventsByAction": [{"action": e["_id"], "count": e["count"]} for e in events_by_action],
        "eventsByUser": [{"userId": e["_id"], "count": e["count"]} for e in events_by_user],
        "eventsByPage": [{"page": e["_id"], "count": e["count"]} for e in events_by_page],
        "frictionByUser": [
            {
                "userId": e["_id"],
                "hesitation": e["hesitation"],
                "rage_click": e["rage_click"],
                "dwell": e["dwell"],
                "total": e["total"],
            }
            for e in friction_by_user
        ],
        "frictionByElement": [{"element": e["_id"], "count": e["count"]} for e in friction_by_element],
        "userIntent": [
            {
                "userId": e["_id"],
                "topPage": e["topPage"],
                "topPageEvents": e["topPageEvents"],
            }
            for e in user_intent
        ],
        "newVsReturning": new_vs_returning,
        "offersServed": [{"offerId": e["_id"], "count": e["count"]} for e in offers_served],
        "hourlyEvents": [{"hour": e["_id"], "count": e["count"]} for e in hourly_events],
        "profiles": profiles,
    }
