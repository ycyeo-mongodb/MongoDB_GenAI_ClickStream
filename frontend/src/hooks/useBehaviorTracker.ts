"use client";

import { useCallback, useRef, useEffect } from "react";

const API = "/api/track";

interface TrackPayload {
  userId: string;
  sessionId: string;
  action: string;
  elementId: string;
  metadata: { page: string; value?: string };
}

async function sendTrack(payload: TrackPayload) {
  try {
    await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* best-effort */
  }
}

export interface BehaviorTrackerOptions {
  userId: string;
  sessionId: string;
  page: string;
  onEvent?: (action: string, elementId: string) => void;
}

export function useBehaviorTracker({
  userId,
  sessionId,
  page,
  onEvent,
}: BehaviorTrackerOptions) {
  const hoverTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const clickCounts = useRef<Map<string, { count: number; first: number }>>(new Map());
  const dwellTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dwellFired = useRef<Set<string>>(new Set());
  const hesitationCounts = useRef<Map<string, number>>(new Map());
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    return () => {
      hoverTimers.current.forEach((t) => clearTimeout(t));
      dwellTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  const fire = useCallback(
    (action: string, elementId: string, value?: string) => {
      sendTrack({ userId, sessionId, action, elementId, metadata: { page, value } });
      onEventRef.current?.(action, elementId);
    },
    [userId, sessionId, page]
  );

  const trackHoverEnter = useCallback(
    (elementId: string, value?: string) => {
      const timer = setTimeout(() => {
        fire("hesitation", elementId, value);
        const prev = hesitationCounts.current.get(elementId) || 0;
        hesitationCounts.current.set(elementId, prev + 1);
      }, 5000);
      hoverTimers.current.set(elementId, timer);
    },
    [fire]
  );

  const trackHoverLeave = useCallback((elementId: string) => {
    const timer = hoverTimers.current.get(elementId);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.current.delete(elementId);
    }
  }, []);

  const trackClick = useCallback(
    (elementId: string, value?: string) => {
      fire("click", elementId, value);

      const now = Date.now();
      const entry = clickCounts.current.get(elementId);
      if (entry && now - entry.first < 3000) {
        entry.count++;
        if (entry.count >= 3) {
          fire("rage_click", elementId, value);
          clickCounts.current.delete(elementId);
        }
      } else {
        clickCounts.current.set(elementId, { count: 1, first: now });
      }
    },
    [fire]
  );

  const trackDwellStart = useCallback(
    (elementId: string, value?: string) => {
      if (dwellFired.current.has(elementId)) return;
      const timer = setTimeout(() => {
        fire("dwell", elementId, value);
        dwellFired.current.add(elementId);
      }, 12000);
      dwellTimers.current.set(elementId, timer);
    },
    [fire]
  );

  const trackDwellEnd = useCallback((elementId: string) => {
    const timer = dwellTimers.current.get(elementId);
    if (timer) {
      clearTimeout(timer);
      dwellTimers.current.delete(elementId);
    }
  }, []);

  const trackScroll = useCallback(
    (value?: string) => {
      fire("scroll", "page-scroll", value);
    },
    [fire]
  );

  const triggerFrictionBurst = useCallback(
    (elementId: string, value?: string) => {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => fire("hesitation", elementId, value), i * 300);
      }
    },
    [fire]
  );

  return {
    trackHoverEnter,
    trackHoverLeave,
    trackClick,
    trackDwellStart,
    trackDwellEnd,
    trackScroll,
    triggerFrictionBurst,
    fire,
  };
}
