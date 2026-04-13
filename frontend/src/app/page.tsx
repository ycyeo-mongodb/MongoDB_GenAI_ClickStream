"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useBehaviorTracker } from "@/hooks/useBehaviorTracker";
import Chatbot from "@/components/Chatbot";

const USER_ID = "user_001";
const SESSION_ID = "sess_demo_web_001";

interface ChangeStreamOffer {
  offerId: string;
  description?: string;
  discountValue?: number;
  targetAudience?: string;
  [key: string]: unknown;
}

interface ChangeStreamEvent {
  offer: ChangeStreamOffer;
  userId: string;
  receivedAt: number;
  dismissed: boolean;
}

const PHONES = [
  {
    id: "samsung-s26-ultra",
    name: "Samsung Galaxy S26 Ultra",
    tagline: "The AI Flagship — 200MP. Titanium. Genius.",
    price: 1898,
    monthlyFrom: 65,
    image: "/images/s26.webp",
    color: "Titanium Silverblue",
    colors: ["#B0C4D8", "#1A1A2E", "#C0A060", "#2D2D2D"],
    highlights: ["200MP Camera", "Snapdragon 8 Elite Gen 2", "6.9\" QHD+ AMOLED", "Galaxy AI Built-in", "5000mAh Battery", "S Pen Included"],
    specs: {
      display: "6.9\" Dynamic AMOLED 2X, 120Hz, 3120x1440",
      processor: "Snapdragon 8 Elite Gen 2 for Galaxy",
      ram: "12GB",
      storage: "256GB / 512GB / 1TB",
      camera: "200MP + 50MP + 10MP + 12MP",
      battery: "5000mAh, 45W Fast Charging",
      os: "Android 16 with One UI 8",
    },
    page: "/store/samsung-s26-ultra",
  },
  {
    id: "iphone-17-pro-max",
    name: "iPhone 17 Pro Max",
    tagline: "Apple Intelligence at its finest.",
    price: 2199,
    monthlyFrom: 75,
    image: "/images/iphone17pm.jpeg",
    color: "Natural Titanium",
    colors: ["#B8B2A6", "#3B3B3D", "#F5F5DC", "#4A3728"],
    highlights: ["48MP Fusion Camera", "A19 Pro Chip", "6.9\" ProMotion OLED", "Apple Intelligence", "Titanium Design", "USB-C Thunderbolt"],
    specs: {
      display: "6.9\" Super Retina XDR, ProMotion 120Hz, 2868x1320",
      processor: "A19 Pro (3nm)",
      ram: "12GB",
      storage: "256GB / 512GB / 1TB",
      camera: "48MP Fusion + 48MP Ultra Wide + 12MP Telephoto (5x)",
      battery: "4685mAh, MagSafe 25W",
      os: "iOS 19 with Apple Intelligence",
    },
    page: "/store/iphone-17-pro-max",
  },
];

const PLANS = [
  { id: "sim-only-50", name: "SIM-Only 5G", data: "50GB", price: 18, contract: "No contract", features: ["5G Network", "Free Caller ID", "Data Rollover"] },
  { id: "5g-plus-100", name: "5G Plus 100", data: "100GB", price: 42, contract: "24 months", features: ["5G Network", "Free Tidal HiFi", "Data Rollover", "Free Roaming 5 countries"] },
  { id: "5g-plus-150", name: "5G Plus 150", data: "150GB", price: 58, contract: "24 months", features: ["5G Network", "Free Tidal HiFi", "Unlimited Data Rollover", "Free Roaming 15 countries", "Priority Support"], popular: true },
  { id: "5g-max-unlimited", name: "5G Max Unlimited", data: "Unlimited", price: 85, contract: "24 months", features: ["5G Ultra Network", "Free Tidal HiFi + Netflix", "Unlimited Data", "Free Roaming 30+ countries", "Concierge Support", "Device Protection"], premium: true },
];

interface ActivityEvent {
  action: string;
  elementId: string;
  ts: number;
}

export default function StorePage() {
  const { messages } = useWebSocket(USER_ID);
  const [selectedPhone, setSelectedPhone] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState(2);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [showMonitor, setShowMonitor] = useState(true);
  const activityRef = useRef<HTMLDivElement>(null);

  const [csEvents, setCsEvents] = useState<ChangeStreamEvent[]>([]);
  const [activeOffer, setActiveOffer] = useState<ChangeStreamEvent | null>(null);
  const [requestingOffer, setRequestingOffer] = useState(false);
  const lastProcessedCount = useRef(0);

  const phoneTabClicks = useRef<Map<string, number>>(new Map());
  const comparisonTriggered = useRef(false);
  const plansDwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plansDwellTriggered = useRef(false);

  const phone = PHONES[selectedPhone];

  const handleEvent = useCallback((action: string, elementId: string) => {
    setActivity((prev) => [...prev.slice(-30), { action, elementId, ts: Date.now() }]);
  }, []);

  useEffect(() => {
    if (messages.length <= lastProcessedCount.current) return;

    const newMsgs = messages.slice(lastProcessedCount.current);
    lastProcessedCount.current = messages.length;

    for (const msg of newMsgs) {
      const m = msg as unknown as Record<string, unknown>;
      const payload = m.payload as Record<string, unknown> | undefined;
      if (!payload) continue;

      if (m.type === "offer_push" || m.type === "offer_notification") {
        const offer = payload.offer as ChangeStreamOffer | undefined;
        if (!offer) continue;
        const evt: ChangeStreamEvent = {
          offer,
          userId: (payload.userId as string) || USER_ID,
          receivedAt: Date.now(),
          dismissed: false,
        };
        setCsEvents((prev) => [evt, ...prev].slice(0, 20));
        setActiveOffer(evt);
      }
    }
  }, [messages]);

  const tracker = useBehaviorTracker({
    userId: USER_ID,
    sessionId: SESSION_ID,
    page: phone.page,
    onEvent: handleEvent,
  });

  const triggerOfferFromComparison = useCallback(async () => {
    if (comparisonTriggered.current || requestingOffer) return;
    comparisonTriggered.current = true;
    setRequestingOffer(true);
    handleEvent("comparison_detected", "Switching Samsung ↔ iPhone — triggering AI offer via Change Stream");
    try {
      const res = await fetch(`http://localhost:8000/api/offer/${USER_ID}`);
      const data = await res.json();
      handleEvent("ai_offer", `${data.offerId} (${Math.round(data.confidence * 100)}%)`);
      const evt: ChangeStreamEvent = {
        offer: { offerId: data.offerId, description: data.description, discountValue: data.discountValue },
        userId: USER_ID,
        receivedAt: Date.now(),
        dismissed: false,
      };
      setCsEvents((prev) => [evt, ...prev].slice(0, 20));
      setActiveOffer(evt);
    } catch { /* */ }
    finally { setRequestingOffer(false); }
  }, [handleEvent, requestingOffer]);

  const handlePhoneTabClick = useCallback((index: number, phoneId: string, phoneName: string) => {
    setSelectedPhone(index);
    tracker.trackClick(`phone-tab-${phoneId}`, phoneName);
    const count = (phoneTabClicks.current.get(phoneId) || 0) + 1;
    phoneTabClicks.current.set(phoneId, count);
    const samsungClicks = phoneTabClicks.current.get("samsung-s26-ultra") || 0;
    const iphoneClicks = phoneTabClicks.current.get("iphone-17-pro-max") || 0;
    if (samsungClicks >= 2 && iphoneClicks >= 2 && !comparisonTriggered.current) {
      handleEvent("comparison_shopping", `Samsung(${samsungClicks}x) vs iPhone(${iphoneClicks}x) — user is comparing!`);
      setTimeout(() => triggerOfferFromComparison(), 1500);
    }
  }, [tracker, handleEvent, triggerOfferFromComparison]);

  const requestAiOffer = useCallback(async () => {
    setRequestingOffer(true);
    try {
      const res = await fetch(`http://localhost:8000/api/offer/${USER_ID}`);
      const data = await res.json();
      handleEvent("ai_offer", `${data.offerId} (${Math.round(data.confidence * 100)}%)`);
      const evt: ChangeStreamEvent = {
        offer: { offerId: data.offerId, description: data.description, discountValue: data.discountValue },
        userId: USER_ID,
        receivedAt: Date.now(),
        dismissed: false,
      };
      setCsEvents((prev) => [evt, ...prev].slice(0, 20));
      setActiveOffer(evt);
    } catch {
      handleEvent("ai_offer", "request failed");
    } finally {
      setRequestingOffer(false);
    }
  }, [handleEvent]);

  useEffect(() => {
    activityRef.current?.scrollTo({ top: activityRef.current.scrollHeight, behavior: "smooth" });
  }, [activity.length]);

  const specsRef = useRef<HTMLDivElement>(null);
  const plansRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const id = (e.target as HTMLElement).dataset.trackId;
          if (!id) return;
          if (e.isIntersecting) {
            tracker.trackDwellStart(id, phone.name);

            if (id === "plan-selector" && !plansDwellTriggered.current) {
              plansDwellTimer.current = setTimeout(() => {
                if (plansDwellTriggered.current) return;
                plansDwellTriggered.current = true;
                handleEvent("dwell_trigger", "15s on Plans section — firing friction events → chatbot");
                tracker.fire("hesitation", "plan-selector", "User dwelling on plan comparison");
                tracker.fire("hesitation", "plan-selector", "User dwelling on plan comparison");
                tracker.fire("hesitation", "plan-selector", "User dwelling on plan comparison");
              }, 15000);
            }
          } else {
            tracker.trackDwellEnd(id);

            if (id === "plan-selector" && plansDwellTimer.current) {
              clearTimeout(plansDwellTimer.current);
              plansDwellTimer.current = null;
            }
          }
        });
      },
      { threshold: 0.5 }
    );
    if (specsRef.current) observer.observe(specsRef.current);
    if (plansRef.current) observer.observe(plansRef.current);
    return () => {
      observer.disconnect();
      if (plansDwellTimer.current) clearTimeout(plansDwellTimer.current);
    };
  }, [tracker, phone.name, handleEvent]);

  const ACTION_STYLES: Record<string, string> = {
    click: "bg-blue-500/20 text-blue-600",
    hesitation: "bg-amber-500/20 text-amber-600",
    rage_click: "bg-red-500/20 text-red-600",
    dwell: "bg-purple-500/20 text-purple-600",
    scroll: "bg-gray-500/20 text-gray-500",
    comparison_shopping: "bg-cyan-500/20 text-cyan-600",
    comparison_detected: "bg-emerald-500/20 text-emerald-600",
    ai_offer: "bg-orange-500/20 text-orange-600",
    dwell_trigger: "bg-pink-500/20 text-pink-600",
  };

  const ACTION_ICONS: Record<string, string> = {
    click: "👆",
    hesitation: "⚡",
    rage_click: "🔥",
    dwell: "👁️",
    scroll: "📜",
    comparison_shopping: "🔄",
    comparison_detected: "🤖",
    ai_offer: "🎁",
    dwell_trigger: "⏱️",
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav Bar — MongoDB Green */}
      <nav className="bg-[#00684A] text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-8">
              <a href="/" className="flex items-center gap-2">
                <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C11.5 5.5 8 8 8 12c0 3 2 5.5 4 6.5C14 17.5 16 15 16 12c0-4-3.5-6.5-4-10z" fill="white" opacity="0.9"/>
                  <path d="M12 2C12.5 5.5 16 8 16 12c0 3-2 5.5-4 6.5" stroke="white" strokeWidth="0.5" fill="none"/>
                </svg>
                <span className="font-black text-xl tracking-tight">LeafyTelco</span>
              </a>
              <div className="hidden md:flex items-center gap-6 text-sm font-medium">
                <a href="#phones" className="hover:text-white/80 transition">Mobile</a>
                <a href="#plans" className="hover:text-white/80 transition">Plans</a>
                <span className="text-white/50">Broadband</span>
                <span className="text-white/50">Deals</span>
                <span className="text-white/50">Support</span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="hidden sm:block text-white/70">Shop Online</span>
              <button className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-xs font-medium transition">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* AI Offer Banner */}
      {activeOffer && !activeOffer.dismissed && (
        <div className="bg-gradient-to-r from-[#00684A] via-emerald-600 to-emerald-500 text-white">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-2xl shrink-0">🎁</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                    Personalized for You
                  </span>
                  <span className="text-[9px] bg-white/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#00ED64] rounded-full animate-pulse" />
                    via MongoDB Change Stream
                  </span>
                </div>
                <p className="text-sm font-semibold mt-0.5 truncate">
                  {activeOffer.offer.description || activeOffer.offer.offerId?.replace(/_/g, " ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {activeOffer.offer.discountValue != null && activeOffer.offer.discountValue > 0 && (
                <span className="bg-white text-[#00684A] text-sm font-black px-3 py-1 rounded-full">
                  {activeOffer.offer.discountValue}% OFF
                </span>
              )}
              <button
                onClick={() => setActiveOffer((prev) => prev ? { ...prev, dismissed: true } : null)}
                className="bg-white/20 hover:bg-white/30 text-white px-4 py-1.5 rounded-full text-xs font-semibold transition"
              >
                Claim Offer →
              </button>
              <button
                onClick={() => setActiveOffer((prev) => prev ? { ...prev, dismissed: true } : null)}
                className="text-white/60 hover:text-white ml-1 transition"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <section className="bg-gradient-to-b from-[#F0F5F3] to-white py-6">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
            <a href="/" className="hover:text-[#00684A]">Home</a>
            <span>/</span>
            <a href="#phones" className="hover:text-[#00684A]">Mobile</a>
            <span>/</span>
            <span className="text-gray-900 font-medium">{phone.name}</span>
          </div>

          {/* Phone Tabs */}
          <div className="flex gap-4 mb-8">
            {PHONES.map((p, i) => (
              <button
                key={p.id}
                onClick={() => handlePhoneTabClick(i, p.id, p.name)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  selectedPhone === i
                    ? "bg-[#00684A] text-white shadow-lg shadow-emerald-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Product Hero */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div
            className="flex justify-center"
            onMouseEnter={() => tracker.trackHoverEnter(`phone-image-${phone.id}`, phone.name)}
            onMouseLeave={() => tracker.trackHoverLeave(`phone-image-${phone.id}`)}
          >
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-emerald-50 to-gray-50 rounded-3xl -z-10" />
              <img
                src={phone.image}
                alt={phone.name}
                className="w-[340px] h-auto object-contain drop-shadow-2xl"
                onClick={() => tracker.trackClick(`phone-image-${phone.id}`, phone.name)}
              />
            </div>
          </div>

          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">{phone.name}</h1>
            <p className="text-lg text-gray-500 mb-6">{phone.tagline}</p>

            <div className="mb-6">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Colour — {phone.color}</p>
              <div className="flex gap-2">
                {phone.colors.map((c, i) => (
                  <button
                    key={i}
                    className="w-8 h-8 rounded-full border-2 border-gray-200 hover:border-[#00684A] transition-colors"
                    style={{ backgroundColor: c }}
                    onClick={() => tracker.trackClick(`color-swatch-${i}`, c)}
                  />
                ))}
              </div>
            </div>

            <div
              className="bg-[#F0F5F3] rounded-2xl p-6 mb-6 cursor-pointer select-none"
              onMouseEnter={() => tracker.trackHoverEnter(`price-section-${phone.id}`, `$${phone.price}`)}
              onMouseLeave={() => tracker.trackHoverLeave(`price-section-${phone.id}`)}
              onClick={() => tracker.trackClick(`price-section-${phone.id}`, `$${phone.price}`)}
            >
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-4xl font-black text-[#00684A]">${phone.price}</span>
                <span className="text-gray-400 text-sm">Retail price (without plan)</span>
              </div>
              <div className="text-gray-600">
                or from <span className="font-bold text-gray-900">${phone.monthlyFrom}/mo</span> with 24-month plan
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                Click to see payment options · T&amp;C apply
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {phone.highlights.map((h) => (
                <div
                  key={h}
                  className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors cursor-default"
                  onMouseEnter={() => tracker.trackHoverEnter(`highlight-${h}`, h)}
                  onMouseLeave={() => tracker.trackHoverLeave(`highlight-${h}`)}
                >
                  <span className="text-[#00684A] text-xs">●</span>
                  {h}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                className="bg-[#00684A] text-white px-8 py-3 rounded-full font-semibold hover:bg-[#004D36] transition-colors shadow-lg shadow-emerald-200"
                onClick={() => tracker.trackClick("buy-now-btn", phone.name)}
              >
                Buy Now
              </button>
              <button
                className="border-2 border-gray-300 text-gray-700 px-8 py-3 rounded-full font-semibold hover:border-[#00684A] hover:text-[#00684A] transition-colors"
                onClick={() => tracker.trackClick("add-to-cart-btn", phone.name)}
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Specs Section */}
      <section
        id="specs"
        ref={specsRef}
        data-track-id={`specs-section-${phone.id}`}
        className="max-w-7xl mx-auto px-4 py-12 border-t border-gray-100"
      >
        <h2 className="text-2xl font-bold mb-6">Specifications</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(phone.specs).map(([key, val]) => (
            <div
              key={key}
              className="flex justify-between items-start p-4 bg-gray-50 rounded-xl hover:bg-emerald-50/50 transition-colors"
              onMouseEnter={() => tracker.trackHoverEnter(`spec-${key}`, val)}
              onMouseLeave={() => tracker.trackHoverLeave(`spec-${key}`)}
            >
              <span className="text-sm font-medium text-gray-500 capitalize">{key}</span>
              <span className="text-sm text-gray-900 text-right max-w-[60%]">{val}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Plans Section */}
      <section
        id="plans"
        ref={plansRef}
        data-track-id="plan-selector"
        className="bg-[#F0F5F3] py-16"
      >
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2">Choose Your Plan</h2>
            <p className="text-gray-500">
              Pair your {phone.name} with the perfect LeafyTelco plan
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PLANS.map((plan, i) => (
              <div
                key={plan.id}
                onClick={() => {
                  setSelectedPlan(i);
                  tracker.trackClick(`plan-card-${plan.id}`, `${plan.name} $${plan.price}/mo`);
                }}
                onMouseEnter={() => tracker.trackHoverEnter(`plan-card-${plan.id}`, plan.name)}
                onMouseLeave={() => tracker.trackHoverLeave(`plan-card-${plan.id}`)}
                className={`relative bg-white rounded-2xl p-6 cursor-pointer transition-all duration-200 border-2 ${
                  selectedPlan === i
                    ? "border-[#00684A] shadow-xl shadow-emerald-100 scale-[1.02]"
                    : "border-transparent shadow-md hover:shadow-lg hover:scale-[1.01]"
                } ${plan.premium ? "ring-2 ring-emerald-400 ring-offset-2" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#00684A] text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                {plan.premium && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                    Premium
                  </div>
                )}

                <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                <div className="text-3xl font-black text-[#00684A] mb-1">
                  {plan.data}
                </div>
                <p className="text-xs text-gray-400 mb-4">{plan.contract}</p>

                <div
                  className="bg-gray-50 rounded-xl p-3 mb-4 text-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    tracker.trackClick(`plan-price-${plan.id}`, `$${plan.price}/mo`);
                  }}
                >
                  <span className="text-3xl font-black">${plan.price}</span>
                  <span className="text-gray-500 text-sm">/mo</span>
                </div>

                <ul className="space-y-2 text-sm text-gray-600">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <span className="text-[#00684A] text-xs">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  className={`mt-6 w-full py-2.5 rounded-full text-sm font-semibold transition-colors ${
                    selectedPlan === i
                      ? "bg-[#00684A] text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-[#00684A] hover:text-white"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedPlan(i);
                    tracker.trackClick(`plan-select-btn-${plan.id}`, plan.name);
                  }}
                >
                  {selectedPlan === i ? "Selected ✓" : "Select Plan"}
                </button>
              </div>
            ))}
          </div>

          {/* Combined Price Summary */}
          <div className="mt-10 bg-white rounded-2xl p-6 shadow-lg max-w-xl mx-auto text-center">
            <p className="text-gray-500 text-sm mb-2">Your Monthly Total</p>
            <div className="text-4xl font-black text-[#00684A] mb-1">
              ${phone.monthlyFrom + PLANS[selectedPlan].price}
              <span className="text-lg text-gray-400 font-normal">/mo</span>
            </div>
            <p className="text-xs text-gray-400">
              {phone.name} + {PLANS[selectedPlan].name} ({PLANS[selectedPlan].data}) · 24 months
            </p>
            <button
              className="mt-4 bg-[#00684A] text-white px-10 py-3 rounded-full font-semibold hover:bg-[#004D36] transition-colors shadow-lg shadow-emerald-200"
              onClick={() => tracker.trackClick("checkout-btn", `${phone.name} + ${PLANS[selectedPlan].name}`)}
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1A1A2E] text-gray-400 py-8 text-center text-xs">
        <p>© 2026 LeafyTelco — Clickstream & GenAI Workshop. Powered by MongoDB Atlas & Agentic AI</p>
      </footer>

      {/* Change Stream Offer Modal */}
      {activeOffer && !activeOffer.dismissed && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden border border-emerald-200">
            <div className="bg-gradient-to-r from-[#00684A] to-emerald-600 px-6 py-4 text-white relative">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-[#00ED64] rounded-full animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-90">
                  MongoDB Change Stream → Real-Time Push
                </span>
              </div>
              <h3 className="text-xl font-bold">Personalized Offer For You</h3>
              <p className="text-white/70 text-xs mt-0.5">
                Delivered via Change Stream — not a page refresh or API poll
              </p>
              <button
                onClick={() => setActiveOffer((prev) => prev ? { ...prev, dismissed: true } : null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                  🎁
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900 text-lg">
                    {activeOffer.offer.offerId?.replace(/_/g, " ").replace(/^OFFER /, "")}
                  </p>
                  {activeOffer.offer.description && (
                    <p className="text-gray-600 text-sm mt-1">{activeOffer.offer.description}</p>
                  )}
                  {activeOffer.offer.discountValue != null && activeOffer.offer.discountValue > 0 && (
                    <div className="inline-block mt-2 bg-emerald-100 text-[#00684A] text-sm font-bold px-3 py-1 rounded-full">
                      Save {activeOffer.offer.discountValue}%
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 bg-[#F0F5F3] rounded-xl p-4 border border-emerald-200">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="text-[#00684A]">🍃</span> How this was delivered
                </p>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <FlowStep num={1} text="Behavioral events detected friction on this page" />
                  <FlowStep num={2} text="AI Agent performed Vector Search on marketing_offers" />
                  <FlowStep num={3} text='Agent wrote lastOfferServed to user_profiles document' />
                  <FlowStep num={4} text="MongoDB Change Stream detected the update and fired" highlight />
                  <FlowStep num={5} text="WebSocket pushed offer to this browser — zero polling" highlight />
                </div>
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={() => setActiveOffer((prev) => prev ? { ...prev, dismissed: true } : null)}
                className="flex-1 bg-[#00684A] text-white py-3 rounded-full font-semibold hover:bg-[#004D36] transition"
              >
                Claim Offer
              </button>
              <button
                onClick={() => setActiveOffer((prev) => prev ? { ...prev, dismissed: true } : null)}
                className="px-6 py-3 rounded-full font-semibold border border-gray-300 text-gray-500 hover:border-gray-400 transition"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Stream Event Log */}
      {csEvents.length > 0 && (
        <div className="fixed bottom-20 left-4 z-[90] w-80">
          <div className="bg-white/95 backdrop-blur-xl border border-emerald-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-[#00ED64] rounded-full animate-pulse" />
                <span className="text-[#00684A] text-[10px] font-bold uppercase tracking-wider">
                  Change Stream Events
                </span>
              </div>
              <span className="text-[9px] text-gray-400">{csEvents.length} received</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {csEvents.map((evt, i) => (
                <div key={i} className="px-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-[#00684A] font-bold">OFFER_PUSH</span>
                    <span className="text-gray-300">→</span>
                    <span className="text-amber-600 font-mono truncate">{evt.offer.offerId}</span>
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5 font-mono">
                    db.user_profiles.watch() → operationType: &quot;update&quot; → lastOfferServed changed
                  </div>
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    {new Date(evt.receivedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Activity Monitor */}
      <div className="fixed top-16 right-4 z-[100]">
        <button
          onClick={() => setShowMonitor(!showMonitor)}
          className="mb-2 bg-white/90 text-gray-700 text-xs px-3 py-1.5 rounded-lg backdrop-blur shadow-lg border border-gray-200 flex items-center gap-1.5 ml-auto"
        >
          <span className={`w-2 h-2 rounded-full ${activity.length > 0 ? "bg-[#00ED64] animate-pulse" : "bg-gray-300"}`} />
          {showMonitor ? "Hide Monitor" : "Show Monitor"}
          {activity.length > 0 && (
            <span className="bg-[#00684A] text-white text-[9px] px-1.5 py-0.5 rounded-full ml-1">
              {activity.length}
            </span>
          )}
        </button>

        {showMonitor && (
          <div className="bg-white/95 backdrop-blur-xl border border-gray-200 rounded-xl shadow-2xl w-80 max-h-[60vh] flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
              <span className="text-gray-800 text-xs font-bold">
                🔍 Behavior Activity Monitor
              </span>
              <button
                onClick={() => setActivity([])}
                className="text-[10px] text-gray-400 hover:text-gray-700 transition"
              >
                Clear
              </button>
            </div>

            <div className="px-3 py-2 border-b border-gray-200 grid grid-cols-2 gap-1.5">
              <button
                className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded-md px-2 py-1.5 hover:bg-amber-100 transition font-medium"
                onClick={() => tracker.fire("hesitation", `plan-card-${PLANS[selectedPlan].id}`, PLANS[selectedPlan].name)}
              >
                ⚡ Hesitate on Plans
              </button>
              <button
                className="text-[10px] bg-red-50 text-red-700 border border-red-200 rounded-md px-2 py-1.5 hover:bg-red-100 transition font-medium"
                onClick={() => {
                  for (let i = 0; i < 3; i++) {
                    setTimeout(() => tracker.trackClick(`price-section-${phone.id}`, `$${phone.price}`), i * 200);
                  }
                }}
              >
                ⚡ Rage Click Price
              </button>
              <button
                className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded-md px-2 py-1.5 hover:bg-purple-100 transition font-medium"
                onClick={() => tracker.fire("dwell", `specs-section-${phone.id}`, phone.name)}
              >
                ⚡ Dwell on Specs
              </button>
              <button
                className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 rounded-md px-2 py-1.5 hover:bg-orange-100 transition font-medium"
                onClick={() => tracker.triggerFrictionBurst(`plan-card-${PLANS[selectedPlan].id}`, PLANS[selectedPlan].name)}
              >
                🔥 Friction Burst (4x)
              </button>
            </div>

            <div className="px-3 py-2 border-b border-gray-200 space-y-1.5">
              <button
                onClick={requestAiOffer}
                disabled={requestingOffer}
                className="w-full text-[10px] bg-gradient-to-r from-[#00684A] to-emerald-600 text-white border border-emerald-500/30 rounded-md px-2 py-2 hover:from-[#004D36] hover:to-emerald-700 transition font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {requestingOffer ? (
                  <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Running AI Agent...</>
                ) : (
                  <>🤖 Request AI Offer (Vector Search + LLM → Change Stream)</>
                )}
              </button>
              <button
                onClick={async () => {
                  try { await fetch("http://localhost:8000/api/reset-demo", { method: "POST" }); } catch { /* */ }
                  setActivity([]);
                  setCsEvents([]);
                  setActiveOffer(null);
                  comparisonTriggered.current = false;
                  phoneTabClicks.current.clear();
                  plansDwellTriggered.current = false;
                  handleEvent("reset", "Demo state cleared — friction will trigger offers again");
                }}
                className="w-full text-[10px] bg-gray-100 text-gray-500 border border-gray-200 rounded-md px-2 py-1.5 hover:bg-gray-200 transition font-medium"
              >
                🔄 Reset Demo State
              </button>
            </div>

            {csEvents.length > 0 && (
              <div className="px-3 py-1.5 border-b border-emerald-200 bg-emerald-50">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-[#00ED64] rounded-full animate-pulse" />
                  <span className="text-[#00684A] text-[10px] font-bold">
                    {csEvents.length} Change Stream event{csEvents.length !== 1 ? "s" : ""} received
                  </span>
                </div>
                <p className="text-[9px] text-[#00684A]/60 font-mono mt-0.5">
                  db.user_profiles.watch() → offer_push
                </p>
              </div>
            )}

            <div ref={activityRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-[11px] font-mono max-h-[35vh]">
              {activity.length === 0 && csEvents.length === 0 && (
                <p className="text-gray-400 text-center py-4">
                  Interact with the page or use buttons above...
                </p>
              )}
              {activity.map((evt, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md ${ACTION_STYLES[evt.action] || "bg-gray-100 text-gray-500"}`}
                >
                  <span>{ACTION_ICONS[evt.action] || "📋"}</span>
                  <span className="font-semibold">{evt.action}</span>
                  <span className="text-gray-400 truncate flex-1">{evt.elementId}</span>
                  <span className="text-gray-300 shrink-0">
                    {new Date(evt.ts).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Chatbot */}
      <Chatbot userId={USER_ID} messages={messages} />
    </div>
  );
}

function FlowStep({ num, text, highlight }: { num: number; text: string; highlight?: boolean }) {
  return (
    <div className={`flex items-start gap-2 ${highlight ? "text-[#00684A] font-semibold" : ""}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
        highlight ? "bg-[#00684A] text-white" : "bg-gray-200 text-gray-500"
      }`}>
        {num}
      </span>
      <span className="pt-0.5">{text}</span>
    </div>
  );
}
