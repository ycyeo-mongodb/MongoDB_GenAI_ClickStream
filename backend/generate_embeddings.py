"""
Generates vector embeddings for all marketing offers using VoyageAI
via MongoDB Atlas's embedding endpoint, and stores them directly in Atlas.

Usage:
    python generate_embeddings.py
"""

import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI

sys.path.insert(0, ".")
from app.config import get_settings


async def generate_offer_embeddings():
    settings = get_settings()

    if not settings.voyage_api_key:
        print("ERROR: VOYAGE_API_KEY not set in .env")
        sys.exit(1)

    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]

    voyage = AsyncOpenAI(
        api_key=settings.voyage_api_key,
        base_url=settings.voyage_base_url,
    )

    offers = await db.marketing_offers.find(
        {}, {"offerId": 1, "description": 1}
    ).to_list(100)

    if not offers:
        print("No offers found in marketing_offers collection.")
        client.close()
        return

    print(f"Generating embeddings for {len(offers)} offers...")
    print(f"  Model: {settings.embedding_model}")
    print(f"  Endpoint: {settings.voyage_base_url}")
    print(f"  Expected dimensions: {settings.embedding_dimensions}")

    descriptions = [o["description"] for o in offers]

    response = await voyage.embeddings.create(
        input=descriptions,
        model=settings.embedding_model,
    )

    for offer, embedding_data in zip(offers, response.data):
        await db.marketing_offers.update_one(
            {"_id": offer["_id"]},
            {"$set": {"vectorEmbedding": embedding_data.embedding}},
        )
        print(f"  ✓ {offer['offerId']}: {len(embedding_data.embedding)} dimensions")

    print(f"\nAll {len(offers)} offer embeddings generated and stored in Atlas.")
    client.close()


if __name__ == "__main__":
    asyncio.run(generate_offer_embeddings())
