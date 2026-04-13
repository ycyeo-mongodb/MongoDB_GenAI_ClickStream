from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class ActionType(str, Enum):
    CLICK = "click"
    SCROLL = "scroll"
    DWELL = "dwell"
    HESITATION = "hesitation"
    RAGE_CLICK = "rage_click"
    PAGE_VIEW = "page_view"


class EventMetadata(BaseModel):
    page: str
    value: Optional[str] = None


class BehavioralEvent(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    userId: str
    sessionId: str
    action: ActionType
    elementId: str
    metadata: EventMetadata


class TrackRequest(BaseModel):
    userId: str
    sessionId: str
    action: ActionType
    elementId: str
    metadata: EventMetadata


class UserProfile(BaseModel):
    userId: str
    isNewCX: bool = True
    traits: List[str] = []
    vectorEmbedding: List[float] = []
    currentContext: str = ""
    lastOfferServed: str = ""


class MarketingOffer(BaseModel):
    offerId: str
    description: str
    discountValue: int
    category: str = ""
    vectorEmbedding: List[float] = []


class OfferResponse(BaseModel):
    offerId: str
    description: str
    discountValue: int
    confidence: float
    reasoning: str


class ChatRequest(BaseModel):
    userId: str
    message: Optional[str] = None


class MongoDBInsight(BaseModel):
    collectionsQueried: List[str] = []
    vectorSearchResults: int = 0
    topScore: float = 0.0
    eventsAnalyzed: int = 0
    pipelineStages: List[str] = []
    embeddingModel: str = ""
    llmModel: str = ""

class ChatResponse(BaseModel):
    reply: str
    offer: Optional[OfferResponse] = None
    mongoInsight: Optional[MongoDBInsight] = None


class WSMessage(BaseModel):
    type: str
    payload: Dict
