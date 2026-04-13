from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

import httpx
from openai import AsyncOpenAI
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.services.behavioral_analysis import summarize_recent_behavior
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

_voyage_client: Optional[AsyncOpenAI] = None


def _get_voyage() -> AsyncOpenAI:
    """VoyageAI client via MongoDB Atlas embedding endpoint (OpenAI-compatible)."""
    global _voyage_client
    if _voyage_client is None:
        settings = get_settings()
        _voyage_client = AsyncOpenAI(
            api_key=settings.voyage_api_key,
            base_url=settings.voyage_base_url,
        )
    return _voyage_client


async def generate_embedding(text: str) -> List[float]:
    """Convert text into a vector embedding using VoyageAI voyage-4 via MongoDB Atlas."""
    settings = get_settings()
    client = _get_voyage()
    response = await client.embeddings.create(
        input=text,
        model=settings.embedding_model,
    )
    return response.data[0].embedding


async def vector_search_offers(
    db: AsyncIOMotorDatabase, query_vector: List[float], limit: int = 3
) -> List[Dict]:
    """
    Perform $vectorSearch against marketing_offers to find
    the best-matching offers for a user's context embedding.
    """
    pipeline = [
        {
            "$vectorSearch": {
                "index": "offer_vector_index",
                "path": "vectorEmbedding",
                "queryVector": query_vector,
                "numCandidates": 50,
                "limit": limit,
            }
        },
        {
            "$project": {
                "_id": 0,
                "offerId": 1,
                "description": 1,
                "discountValue": 1,
                "category": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    results = await db.marketing_offers.aggregate(pipeline).to_list(limit)

    await ws_manager.broadcast({
        "type": "db_log",
        "payload": {
            "event": "vector_search_executed",
            "collection": "marketing_offers",
            "resultsCount": len(results),
            "topMatch": results[0]["offerId"] if results else None,
            "topScore": results[0]["score"] if results else None,
        },
    })

    return results


async def _call_llm(system_prompt: str, user_prompt: str) -> str:
    """Call Claude Haiku 4.5 via API Gateway → Lambda → Bedrock."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.llm_endpoint,
            json={
                "system": system_prompt,
                "prompt": user_prompt,
                "max_tokens": 300,
                "temperature": 0.3,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["response"]


async def get_agentic_offer(db: AsyncIOMotorDatabase, user_id: str) -> Optional[Dict]:
    """
    The AI Brain:
    1. Summarizes user behavior via MongoDB aggregation pipeline
    2. Generates context embedding via VoyageAI voyage-4
    3. Performs $vectorSearch to find candidate offers
    4. Claude Haiku 4.5 (via Bedrock) reasons about the best match
    """
    profile = await db.user_profiles.find_one({"userId": user_id})
    if not profile:
        return None

    behavior_summary = await summarize_recent_behavior(db, user_id)
    current_context = profile.get("currentContext", "")

    if not current_context:
        current_context = _build_context_from_summary(behavior_summary)

    await ws_manager.broadcast({
        "type": "db_log",
        "payload": {
            "event": "agentic_analysis_started",
            "userId": user_id,
            "context": current_context[:200],
            "totalEvents": behavior_summary.get("totalEvents", 0),
        },
    })

    context_embedding = await generate_embedding(current_context)
    candidate_offers = await vector_search_offers(db, context_embedding)

    if not candidate_offers:
        return None

    decision = await _llm_select_offer(
        current_context, behavior_summary, candidate_offers, profile
    )

    await db.user_profiles.update_one(
        {"userId": user_id},
        {"$set": {"lastOfferServed": decision["offerId"]}},
    )

    await ws_manager.broadcast({
        "type": "doc_write",
        "payload": {
            "collection": "user_profiles",
            "operation": "updateOne",
            "filter": {"userId": user_id},
            "update": {"$set": {"lastOfferServed": decision["offerId"]}},
        },
    })

    return decision


def _build_context_from_summary(summary: dict) -> str:
    parts = []
    if summary.get("topPages"):
        pages = ", ".join(p["page"] for p in summary["topPages"][:3])
        parts.append(f"Browsing pages: {pages}")
    if summary.get("actionBreakdown"):
        actions = ", ".join(
            f"{k}({v})" for k, v in summary["actionBreakdown"].items()
        )
        parts.append(f"Actions: {actions}")
    if summary.get("topElements"):
        elems = ", ".join(e["element"] for e in summary["topElements"][:3])
        parts.append(f"Interacting with: {elems}")
    return ". ".join(parts) if parts else "General browsing behavior"


async def _llm_select_offer(
    context: str,
    behavior: dict,
    offers: List[Dict],
    profile: dict,
) -> Dict:
    """Use Claude Haiku 4.5 via Bedrock to reason about the best offer."""
    offers_text = "\n".join(
        f"- {o['offerId']}: {o['description']} ({o['discountValue']}% off, "
        f"vector_score: {o.get('score', 0):.3f})"
        for o in offers
    )

    system_prompt = (
        "You are an AI personalization agent for the LeafyTelco mobile telecom store. "
        "Your job is to select the BEST offer for the user based on their "
        "real-time behavior and context. You MUST respond with valid JSON only, "
        "no markdown fences, no extra text."
    )

    user_prompt = f"""User Context: {context}

Behavior Summary:
- Total events: {behavior.get('totalEvents', 0)}
- Pages visited: {behavior.get('uniquePages', [])}
- Action breakdown: {behavior.get('actionBreakdown', {})}
- Is new customer: {profile.get('isNewCX', False)}
- Traits: {profile.get('traits', [])}

Candidate Offers (ranked by vector similarity):
{offers_text}

Select the best offer for this user. Respond ONLY with this JSON structure:
{{"offerId": "the chosen offer ID", "confidence": 0.0-1.0, "reasoning": "1-2 sentence explanation"}}"""

    try:
        raw = await _call_llm(system_prompt, user_prompt)

        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        result = json.loads(cleaned)
        chosen = next(
            (o for o in offers if o["offerId"] == result.get("offerId")),
            offers[0],
        )

        await ws_manager.broadcast({
            "type": "db_log",
            "payload": {
                "event": "llm_decision_made",
                "model": "Claude Haiku 4.5 (Bedrock)",
                "offerId": chosen["offerId"],
                "confidence": result.get("confidence", 0.8),
                "reasoning": result.get("reasoning", "")[:150],
            },
        })

        return {
            "offerId": chosen["offerId"],
            "description": chosen["description"],
            "discountValue": chosen["discountValue"],
            "confidence": result.get("confidence", 0.8),
            "reasoning": result.get("reasoning", "Best match for user context"),
        }

    except Exception as e:
        logger.warning(f"LLM call failed, falling back to vector score: {e}")
        best = offers[0]
        return {
            "offerId": best["offerId"],
            "description": best["description"],
            "discountValue": best["discountValue"],
            "confidence": best.get("score", 0.7),
            "reasoning": f"Top vector match (LLM unavailable: {str(e)[:80]})",
        }
