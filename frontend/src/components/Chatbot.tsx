"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { WSMessage } from "@/hooks/useWebSocket";

const API = "http://localhost:8000/api";

interface MongoInsight {
  collectionsQueried: string[];
  vectorSearchResults: number;
  topScore: number;
  eventsAnalyzed: number;
  pipelineStages: string[];
  embeddingModel: string;
  llmModel: string;
}

interface ChatMessage {
  role: "assistant" | "user";
  text: string;
  offer?: {
    offerId: string;
    description: string;
    discountValue: number;
  };
  mongoInsight?: MongoInsight;
  timestamp: number;
}

interface Props {
  userId: string;
  messages: WSMessage[];
}

export default function Chatbot({ userId, messages }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasNotification, setHasNotification] = useState(false);
  const [pulseCount, setPulseCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  useEffect(() => {
    const contextMsg = [...messages].reverse().find(
      (m) =>
        m.type === "db_log" &&
        (m.payload as Record<string, string>).event === "context_updated" &&
        (m.payload as Record<string, string>).userId === userId
    );

    if (contextMsg && !triggeredRef.current) {
      triggeredRef.current = true;
      setHasNotification(true);
      setPulseCount((c) => c + 1);

      setTimeout(() => {
        setIsOpen(true);
        setHasNotification(false);
        sendProactiveMessage();
      }, 800);
    }
  }, [messages, userId]);

  const sendProactiveMessage = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          offer: data.offer || undefined,
          mongoInsight: data.mongoInsight || undefined,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Hi! I noticed you might need some help. What are you looking for today?",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setChat((prev) => [...prev, { role: "user", text, timestamp: Date.now() }]);
    setLoading(true);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: text }),
      });
      const data = await res.json();
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data.reply,
          offer: data.offer || undefined,
          mongoInsight: data.mongoInsight || undefined,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setChat((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry, I'm having trouble right now. Please try again!",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, userId]);

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => {
            setIsOpen(true);
            setHasNotification(false);
            if (chat.length === 0) {
              sendProactiveMessage();
            }
          }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-mongo-green to-mongo-green-dark 
                     rounded-full shadow-2xl shadow-emerald-900/40 flex items-center justify-center 
                     hover:scale-110 transition-all duration-200 group"
        >
          <span className="text-2xl group-hover:scale-110 transition-transform">💬</span>
          {hasNotification && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-mongo-green-light rounded-full 
                           flex items-center justify-center text-[10px] font-bold text-black animate-bounce">
              {pulseCount}
            </span>
          )}
          {hasNotification && (
            <span className="absolute inset-0 rounded-full bg-mongo-green/50 animate-ping" />
          )}
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] h-[520px] flex flex-col 
                       bg-white border border-gray-200 rounded-2xl shadow-2xl shadow-black/10
                       animate-slide-in overflow-hidden">
          <div className="px-4 py-3 bg-gradient-to-r from-mongo-green to-mongo-green-dark flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-base">🤖</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">LeafyTelco AI Assistant</p>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-mongo-green-light animate-pulse" />
                  <p className="text-[10px] text-emerald-200">Powered by MongoDB Atlas</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-emerald-200 hover:text-white text-lg leading-none w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10"
            >
              ×
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
            {chat.length === 0 && !loading && (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                <p>Starting conversation...</p>
              </div>
            )}

            {chat.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-mongo-green text-white rounded-br-md"
                      : "bg-white text-gray-800 rounded-bl-md border border-gray-200 shadow-sm"
                  }`}
                >
                  {msg.text}

                  {msg.offer && (
                    <div className="mt-2 p-2.5 bg-gradient-to-r from-mongo-green-tint to-emerald-50 rounded-xl border border-emerald-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">🎯</span>
                        <span className="text-[10px] uppercase tracking-wider text-mongo-green font-semibold">
                          Your Offer
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 leading-snug">{msg.offer.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-lg font-black text-mongo-green">
                          {msg.offer.discountValue}% OFF
                        </span>
                        <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {msg.offer.offerId}
                        </span>
                      </div>
                    </div>
                  )}

                  {msg.mongoInsight && (
                    <MongoInsightCard insight={msg.mongoInsight} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-mongo-green rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-2 h-2 bg-mongo-green rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-2 h-2 bg-mongo-green rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-3 border-t border-gray-200 bg-white shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Ask me anything..."
                disabled={loading}
                className="flex-1 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 px-3.5 py-2.5 
                          rounded-xl border border-gray-200 focus:border-mongo-green/50 focus:outline-none
                          disabled:opacity-50 transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="w-10 h-10 bg-mongo-green hover:bg-mongo-green-dark disabled:bg-gray-300 disabled:opacity-40
                          rounded-xl flex items-center justify-center transition-colors shrink-0"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MongoInsightCard({ insight }: { insight: MongoInsight }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-xl border border-mongo-green/30 bg-mongo-green-tint/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-mongo-green-tint transition-colors"
      >
        <span className="text-xs">🍃</span>
        <span className="text-[10px] text-mongo-green font-semibold uppercase tracking-wider flex-1">
          Powered by MongoDB Atlas
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-mongo-green/70 font-mono">
            {insight.vectorSearchResults} vectors · {insight.eventsAnalyzed} events
          </span>
          <span className="text-mongo-green/50 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2 space-y-1.5 border-t border-mongo-green/20 pt-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">Collections:</span>
            <div className="flex flex-wrap gap-1">
              {insight.collectionsQueried.map((c) => (
                <span key={c} className="text-[9px] font-mono bg-mongo-green-tint text-mongo-green px-1.5 py-0.5 rounded border border-mongo-green/20">
                  {c}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-gray-500">Pipeline:</span>
            {insight.pipelineStages.map((s, i) => (
              <div key={i} className="flex items-start gap-1.5 ml-1">
                <span className="text-mongo-green text-[10px] shrink-0 mt-0.5">▸</span>
                <span className="text-[10px] font-mono text-mongo-green-dark leading-tight">{s}</span>
              </div>
            ))}
          </div>

          {insight.topScore > 0 && (
            <div className="flex items-center gap-3 text-[10px]">
              <span className="text-gray-500">Top score: <span className="text-mongo-green font-mono">{insight.topScore.toFixed(4)}</span></span>
              <span className="text-gray-500">Embedding: <span className="text-purple-600 font-mono">{insight.embeddingModel}</span></span>
            </div>
          )}

          <div className="text-[10px] text-gray-500">
            LLM: <span className="text-amber-600 font-mono">{insight.llmModel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
