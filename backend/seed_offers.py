"""
Seeds the marketing_offers collection with offers referenced by seed_analytics_data.py
plus a wider variety so $vectorSearch has good candidates to choose from.

Run AFTER seeding analytics and BEFORE generate_embeddings.py:
    python seed_offers.py
    python generate_embeddings.py
"""
import asyncio
import sys

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, ".")
from app.config import get_settings


OFFERS = [
    {
        "offerId": "OFFER_S26_ULTRA_15",
        "description": "15% off the Samsung Galaxy S26 Ultra when bundled with a 5G Plus 150 plan. Includes free wireless charger and 12-month device protection.",
        "discountValue": 15,
        "category": "device_bundle",
    },
    {
        "offerId": "OFFER_IP17_BROADBAND_FREE",
        "description": "Free home broadband for 6 months with any iPhone 17 Pro Max upgrade on the 5G Max Unlimited plan. Loyalty reward for returning customers.",
        "discountValue": 100,
        "category": "broadband_bundle",
    },
    {
        "offerId": "OFFER_SIM_ONLY_50",
        "description": "SIM-Only 5G plan from $15/month for 12 months. No contract, no commitment, perfect for budget-conscious shoppers.",
        "discountValue": 17,
        "category": "sim_only",
    },
    {
        "offerId": "OFFER_5G_PLAN_30",
        "description": "30% off any 5G Plus or 5G Max plan for the first 6 months when you switch. Compare and save versus other carriers.",
        "discountValue": 30,
        "category": "plan_discount",
    },
    {
        "offerId": "OFFER_STREAM_BUNDLE",
        "description": "Free Netflix, Disney+, and Spotify Premium for 12 months on the 5G Max Unlimited plan. Perfect for entertainment lovers and social media users.",
        "discountValue": 100,
        "category": "entertainment_bundle",
    },
    {
        "offerId": "OFFER_FAMILY_BUNDLE_40",
        "description": "Family bundle: 40% off when you add 3 or more lines on 5G Plus 150. Includes free family broadband and parental control add-ons.",
        "discountValue": 40,
        "category": "family_bundle",
    },
    {
        "offerId": "OFFER_PRESTIGE_TIER",
        "description": "Prestige Tier upgrade: complimentary iPhone 17 Pro Max with 24-month 5G Max Unlimited plan. Premium concierge support and corporate priority lane.",
        "discountValue": 25,
        "category": "premium_tier",
    },
    {
        "offerId": "OFFER_SENIORS_PLAN",
        "description": "Seniors Simple Plan: $12/month for unlimited calls and texts plus 10GB 5G data. Easy setup, large-print bill, and 24/7 phone support.",
        "discountValue": 33,
        "category": "seniors_plan",
    },
    # Extra offers to give vector search more variety
    {
        "offerId": "OFFER_NEW_CX_WELCOME_20",
        "description": "Welcome offer for new customers: 20% off your first 3 months on any 5G plan. No activation fee.",
        "discountValue": 20,
        "category": "new_customer",
    },
    {
        "offerId": "OFFER_TRADE_IN_BOOST",
        "description": "Get up to $400 extra trade-in credit when you upgrade to a Samsung Galaxy S26 Ultra or iPhone 17 Pro Max.",
        "discountValue": 20,
        "category": "trade_in",
    },
    {
        "offerId": "OFFER_DATA_DOUBLE",
        "description": "Double data on 5G Plus 100 and 5G Plus 150 plans for 12 months. Heavy users save big on overage charges.",
        "discountValue": 50,
        "category": "data_boost",
    },
    {
        "offerId": "OFFER_CHECKOUT_ABANDON_10",
        "description": "Special 10% checkout incentive: complete your order in the next 24 hours and we'll waive shipping plus throw in a free case.",
        "discountValue": 10,
        "category": "checkout_recovery",
    },
]


async def seed():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]

    inserted = 0
    updated = 0
    for offer in OFFERS:
        result = await db.marketing_offers.update_one(
            {"offerId": offer["offerId"]},
            {"$set": offer},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted += 1
            print(f"  + {offer['offerId']}: {offer['description'][:60]}...")
        else:
            updated += 1
            print(f"  ~ {offer['offerId']}: refreshed")

    total = await db.marketing_offers.count_documents({})
    print(
        f"\nDone. Inserted {inserted}, refreshed {updated}. "
        f"marketing_offers now has {total} document(s)."
    )
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
