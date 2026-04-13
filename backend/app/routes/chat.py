from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter

from app.database import get_db
from app.models import ChatRequest, ChatResponse, OfferResponse, MongoDBInsight
from app.services.agentic_ai import (
    generate_embedding,
    vector_search_offers,
    _call_llm,
    _build_context_from_summary,
)
from app.services.behavioral_analysis import summarize_recent_behavior
from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    db = get_db()

    profile = await db.user_profiles.find_one({"userId": req.userId})
    if not profile:
        return ChatResponse(
            reply="Hi there! I don't have your profile yet — browse around and I'll get to know you!",
            mongoInsight=MongoDBInsight(
                collectionsQueried=["user_profiles"],
                pipelineStages=["findOne"],
            ),
        )

    behavior = await summarize_recent_behavior(db, req.userId)
    current_context = profile.get("currentContext", "")
    if not current_context:
        current_context = _build_context_from_summary(behavior)

    context_embedding = await generate_embedding(current_context)
    candidates = await vector_search_offers(db, context_embedding, limit=12)

    top_score = candidates[0].get("score", 0) if candidates else 0.0
    total_events = behavior.get("totalEvents", 0)

    offers_text = "\n".join(
        f"  {i+1}. [{o['offerId']}] {o['description']} — {o['discountValue']}% off (relevance: {o.get('score', 0):.2f})"
        for i, o in enumerate(candidates)
    ) if candidates else "No offers available."

    user_msg = req.message or ""
    last_offer = profile.get("lastOfferServed", "")

    system_prompt = (
        "You are a knowledgeable, enthusiastic AI sales assistant for LeafyTelco (a mobile telecom provider). "
        "You have access to the customer's REAL-TIME browsing behaviour from MongoDB and a set of personalised "
        "offers found via MongoDB Atlas Vector Search.\n\n"
        "RULES:\n"
        "- Be conversational, warm, and concise (2-4 sentences for the reply).\n"
        "- You have MANY offers available. Do NOT keep recommending the same one.\n"
        "- If the customer asks for OTHER deals, broadband, bundles, entertainment, family plans — "
        "look through ALL available offers and recommend something DIFFERENT.\n"
        "- If you already recommended an offer (see lastOfferServed), suggest a DIFFERENT one next time.\n"
        "- Mention specific numbers: prices, percentages, data amounts.\n"
        "- For proactive messages (no user text), acknowledge their browsing frustration and recommend the single best offer.\n"
        "- Always include the offerId of the offer you're recommending.\n\n"
        "Respond ONLY with valid JSON:\n"
        "{\"reply\": \"your conversational message\", \"offerId\": \"the offer ID you recommend (or null)\"}"
    )

    user_prompt = f"""== CUSTOMER PROFILE (from MongoDB user_profiles collection) ==
userId: {req.userId}
isNewCX: {profile.get('isNewCX', False)}
traits: {profile.get('traits', [])}
lastOfferAlreadyServed: {last_offer or 'none'}

== REAL-TIME BEHAVIOUR (from MongoDB behavioral_events — Time Series aggregation) ==
Total events in session: {total_events}
Pages visited: {behavior.get('uniquePages', [])}
Action breakdown: {behavior.get('actionBreakdown', {})}
Friction context: {current_context}

== OFFERS RANKED BY VECTOR SEARCH (from MongoDB marketing_offers — $vectorSearch cosine similarity) ==
{offers_text}

== CUSTOMER MESSAGE ==
{user_msg if user_msg else "(No message — customer is hesitating. Proactively reach out and recommend the BEST offer for their situation.)"}

IMPORTANT: If lastOfferAlreadyServed is set, DO NOT recommend that same offer again — pick a different one.

Respond ONLY with JSON: {{"reply": "your message", "offerId": "chosen offer ID or null"}}"""

    insight = MongoDBInsight(
        collectionsQueried=["user_profiles", "behavioral_events", "marketing_offers"],
        vectorSearchResults=len(candidates),
        topScore=round(top_score, 4),
        eventsAnalyzed=total_events,
        pipelineStages=[
            "db.user_profiles.findOne()",
            f"db.behavioral_events.aggregate([$match, $group]) → {total_events} events",
            f"db.marketing_offers.$vectorSearch(cosine, limit=12) → {len(candidates)} results",
            "Claude Haiku 4.5 via Bedrock → offer selection",
        ],
        embeddingModel="VoyageAI voyage-4 (1024-dim)",
        llmModel="Claude Haiku 4.5 (Amazon Bedrock)",
    )

    try:
        raw = await _call_llm(system_prompt, user_prompt)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        result = json.loads(cleaned)
        reply = result.get("reply", "Let me look into that for you!")
        chosen_id = result.get("offerId")

        offer_response: Optional[OfferResponse] = None
        if chosen_id and candidates:
            chosen = next((o for o in candidates if o["offerId"] == chosen_id), None)
            if chosen:
                offer_response = OfferResponse(
                    offerId=chosen["offerId"],
                    description=chosen["description"],
                    discountValue=chosen["discountValue"],
                    confidence=chosen.get("score", 0.8),
                    reasoning="Recommended by AI chatbot via Vector Search",
                )
                await db.user_profiles.update_one(
                    {"userId": req.userId},
                    {"$set": {"lastOfferServed": chosen["offerId"]}},
                )
                await ws_manager.broadcast({
                    "type": "doc_write",
                    "payload": {
                        "collection": "user_profiles",
                        "operation": "updateOne",
                        "filter": {"userId": req.userId},
                        "update": {"$set": {"lastOfferServed": chosen["offerId"]}},
                    },
                })

        await ws_manager.broadcast({
            "type": "db_log",
            "payload": {
                "event": "chatbot_response",
                "userId": req.userId,
                "offerId": chosen_id,
                "model": "Claude Haiku 4.5 (Bedrock)",
                "vectorResults": len(candidates),
                "topScore": round(top_score, 4),
            },
        })

        return ChatResponse(reply=reply, offer=offer_response, mongoInsight=insight)

    except Exception as e:
        logger.warning(f"Chat LLM failed: {e}")
        fallback = "I noticed you might need some help! "
        if candidates:
            top = candidates[0]
            fallback += f"We have a great deal for you: {top['description']} — that's {top['discountValue']}% off!"
            return ChatResponse(
                reply=fallback,
                offer=OfferResponse(
                    offerId=top["offerId"],
                    description=top["description"],
                    discountValue=top["discountValue"],
                    confidence=top.get("score", 0.7),
                    reasoning="Fallback recommendation",
                ),
                mongoInsight=insight,
            )
        return ChatResponse(reply=fallback + "How can I help you today?", mongoInsight=insight)
