"""
Seeds realistic behavioral events for multiple users with varied intents.
Each user has a distinct browsing pattern and friction profile.
"""
import asyncio
import random
import sys
from datetime import datetime, timedelta

from motor.motor_asyncio import AsyncIOMotorClient

sys.path.insert(0, ".")
from app.config import get_settings

USERS = {
    "user_001": {
        "traits": ["new_visitor", "mobile"],
        "isNewCX": True,
        "intent": "samsung_s26_ultra",
        "pages": ["/store/samsung-s26-ultra", "/store/plans", "/store/iphone-17-pro-max"],
        "primary_page": "/store/samsung-s26-ultra",
        "elements": ["phone-image-samsung-s26-ultra", "price-section-samsung-s26-ultra", "plan-card-5g-plus-150", "plan-card-5g-max-unlimited", "specs-section-samsung-s26-ultra", "color-swatch-0", "buy-now-btn"],
        "friction_element": "plan-card-5g-plus-150",
        "lastOffer": "OFFER_S26_ULTRA_15",
    },
    "user_002": {
        "traits": ["returning", "high_value"],
        "isNewCX": False,
        "intent": "iphone_upgrade",
        "pages": ["/store/iphone-17-pro-max", "/store/plans", "/store/samsung-s26-ultra"],
        "primary_page": "/store/iphone-17-pro-max",
        "elements": ["phone-image-iphone-17-pro-max", "price-section-iphone-17-pro-max", "plan-card-5g-max-unlimited", "specs-section-iphone-17-pro-max", "color-swatch-1", "checkout-btn"],
        "friction_element": "price-section-iphone-17-pro-max",
        "lastOffer": "OFFER_IP17_BROADBAND_FREE",
    },
    "user_003": {
        "traits": ["new_visitor", "desktop", "price_sensitive"],
        "isNewCX": True,
        "intent": "budget_plan_seeker",
        "pages": ["/store/plans", "/store/samsung-s26-ultra", "/store/iphone-17-pro-max"],
        "primary_page": "/store/plans",
        "elements": ["plan-card-sim-only-50", "plan-card-5g-plus-100", "plan-price-sim-only-50", "plan-price-5g-plus-100", "plan-select-btn-sim-only-50"],
        "friction_element": "plan-price-5g-plus-100",
        "lastOffer": "OFFER_SIM_ONLY_50",
    },
    "user_004": {
        "traits": ["returning", "price_sensitive", "comparison_shopper"],
        "isNewCX": False,
        "intent": "plan_comparison",
        "pages": ["/store/plans", "/store/samsung-s26-ultra", "/store/iphone-17-pro-max"],
        "primary_page": "/store/plans",
        "elements": ["plan-card-5g-plus-100", "plan-card-5g-plus-150", "plan-card-5g-max-unlimited", "plan-price-5g-plus-150", "plan-price-5g-max-unlimited"],
        "friction_element": "plan-card-5g-plus-150",
        "lastOffer": "OFFER_5G_PLAN_30",
    },
    "user_005": {
        "traits": ["new_visitor", "mobile", "young", "social_media"],
        "isNewCX": True,
        "intent": "entertainment_bundle",
        "pages": ["/store/iphone-17-pro-max", "/store/plans", "/store/samsung-s26-ultra"],
        "primary_page": "/store/iphone-17-pro-max",
        "elements": ["phone-image-iphone-17-pro-max", "plan-card-5g-max-unlimited", "checkout-btn", "add-to-cart-btn", "specs-section-iphone-17-pro-max"],
        "friction_element": "plan-card-5g-max-unlimited",
        "lastOffer": "OFFER_STREAM_BUNDLE",
    },
    "user_006": {
        "traits": ["returning", "family", "broadband_interest"],
        "isNewCX": False,
        "intent": "family_broadband",
        "pages": ["/store/plans", "/store/samsung-s26-ultra"],
        "primary_page": "/store/plans",
        "elements": ["plan-card-5g-plus-150", "plan-card-5g-max-unlimited", "plan-price-5g-plus-150", "checkout-btn"],
        "friction_element": "plan-price-5g-max-unlimited",
        "lastOffer": "OFFER_FAMILY_BUNDLE_40",
    },
    "user_007": {
        "traits": ["new_visitor", "premium", "corporate"],
        "isNewCX": True,
        "intent": "prestige_tier",
        "pages": ["/store/iphone-17-pro-max", "/store/samsung-s26-ultra", "/store/plans"],
        "primary_page": "/store/iphone-17-pro-max",
        "elements": ["phone-image-iphone-17-pro-max", "price-section-iphone-17-pro-max", "plan-card-5g-max-unlimited", "buy-now-btn", "color-swatch-0"],
        "friction_element": "price-section-iphone-17-pro-max",
        "lastOffer": "OFFER_PRESTIGE_TIER",
    },
    "user_008": {
        "traits": ["returning", "senior", "simple"],
        "isNewCX": False,
        "intent": "senior_simple_plan",
        "pages": ["/store/plans", "/store/samsung-s26-ultra"],
        "primary_page": "/store/plans",
        "elements": ["plan-card-sim-only-50", "plan-card-5g-plus-100", "plan-price-sim-only-50"],
        "friction_element": "plan-card-sim-only-50",
        "lastOffer": "OFFER_SENIORS_PLAN",
    },
}

ACTIONS = ["click", "scroll", "hesitation", "dwell", "rage_click"]
ACTION_WEIGHTS_NORMAL = [0.45, 0.25, 0.15, 0.10, 0.05]
ACTION_WEIGHTS_FRUSTRATED = [0.20, 0.10, 0.35, 0.20, 0.15]


def random_action(frustrated: bool = False) -> str:
    weights = ACTION_WEIGHTS_FRUSTRATED if frustrated else ACTION_WEIGHTS_NORMAL
    return random.choices(ACTIONS, weights=weights, k=1)[0]


async def seed():
    settings = get_settings()
    client = AsyncIOMotorClient(settings.mongodb_uri)
    db = client[settings.database_name]

    now = datetime.utcnow()
    all_events = []

    for uid, profile in USERS.items():
        existing = await db.user_profiles.find_one({"userId": uid})
        if existing:
            await db.user_profiles.update_one(
                {"userId": uid},
                {"$set": {
                    "traits": profile["traits"],
                    "isNewCX": profile["isNewCX"],
                    "lastOfferServed": profile["lastOffer"],
                }},
            )
        else:
            await db.user_profiles.insert_one({
                "userId": uid,
                "isNewCX": profile["isNewCX"],
                "traits": profile["traits"],
                "vectorEmbedding": [],
                "currentContext": "",
                "lastOfferServed": profile["lastOffer"],
            })
        print(f"  ✓ Profile: {uid} ({', '.join(profile['traits'])})")

        num_events = random.randint(25, 60)
        session_id = f"sess_{uid}_{random.randint(100, 999)}"
        base_time = now - timedelta(hours=random.randint(1, 48))

        for j in range(num_events):
            ts = base_time + timedelta(seconds=j * random.randint(2, 15))
            frustrated = j > num_events * 0.6
            action = random_action(frustrated)
            element = (
                profile["friction_element"]
                if frustrated and random.random() > 0.3
                else random.choice(profile["elements"])
            )
            page = profile["primary_page"] if random.random() > 0.3 else random.choice(profile["pages"])

            value_map = {
                "phone-image-samsung-s26-ultra": "Samsung Galaxy S26 Ultra",
                "phone-image-iphone-17-pro-max": "iPhone 17 Pro Max",
                "price-section-samsung-s26-ultra": "$1898",
                "price-section-iphone-17-pro-max": "$2199",
                "plan-card-sim-only-50": "SIM-Only 5G $18/mo",
                "plan-card-5g-plus-100": "5G Plus 100 $42/mo",
                "plan-card-5g-plus-150": "5G Plus 150 $58/mo",
                "plan-card-5g-max-unlimited": "5G Max Unlimited $85/mo",
            }

            all_events.append({
                "timestamp": ts,
                "userId": uid,
                "sessionId": session_id,
                "action": action,
                "elementId": element,
                "metadata": {
                    "page": page,
                    "value": value_map.get(element, element),
                },
            })

    if all_events:
        await db.behavioral_events.insert_many(all_events)
        print(f"\n  ✓ Inserted {len(all_events)} behavioral events for {len(USERS)} users")

    print("\nDone! Analytics data seeded.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
