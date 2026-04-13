from __future__ import annotations

import asyncio
import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

_change_stream_task: Optional[asyncio.Task] = None


async def _watch_user_profiles(db: AsyncIOMotorDatabase):
    """
    Phase 4: Watch the user_profiles collection for updates to lastOfferServed.
    When the Agent updates this field, push a WebSocket message to the frontend
    so it can display the personalized offer in real time.
    """
    pipeline = [
        {
            "$match": {
                "operationType": "update",
                "updateDescription.updatedFields.lastOfferServed": {"$exists": True},
            }
        }
    ]

    try:
        async with db.user_profiles.watch(
            pipeline, full_document="updateLookup"
        ) as stream:
            logger.info("Change Stream active on user_profiles collection")
            async for change in stream:
                doc = change.get("fullDocument", {})
                user_id = doc.get("userId", "unknown")
                offer_id = doc.get("lastOfferServed", "")

                if not offer_id:
                    continue

                offer = await db.marketing_offers.find_one(
                    {"offerId": offer_id}, {"_id": 0, "vectorEmbedding": 0}
                )

                logger.info(
                    f"Change Stream fired: user={user_id}, offer={offer_id}"
                )

                await ws_manager.broadcast({
                    "type": "db_log",
                    "payload": {
                        "event": "change_stream_fired",
                        "collection": "user_profiles",
                        "userId": user_id,
                        "offerId": offer_id,
                    },
                })

                await ws_manager.send_to_user(user_id, {
                    "type": "offer_push",
                    "payload": {
                        "userId": user_id,
                        "offer": offer or {"offerId": offer_id},
                    },
                })

                await ws_manager.broadcast({
                    "type": "offer_notification",
                    "payload": {
                        "userId": user_id,
                        "offer": offer or {"offerId": offer_id},
                    },
                })

    except asyncio.CancelledError:
        logger.info("Change Stream task cancelled")
    except Exception as e:
        logger.error(f"Change Stream error: {e}")
        await asyncio.sleep(5)


async def start_change_stream(db: AsyncIOMotorDatabase):
    global _change_stream_task
    if _change_stream_task is None or _change_stream_task.done():
        _change_stream_task = asyncio.create_task(_watch_user_profiles(db))
        logger.info("Change Stream watcher started")


async def stop_change_stream():
    global _change_stream_task
    if _change_stream_task and not _change_stream_task.done():
        _change_stream_task.cancel()
        try:
            await _change_stream_task
        except asyncio.CancelledError:
            pass
        _change_stream_task = None
        logger.info("Change Stream watcher stopped")
