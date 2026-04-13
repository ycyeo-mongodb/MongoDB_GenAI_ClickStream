import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import get_db, close_client
from app.routes.track import router as track_router
from app.routes.offers import router as offers_router
from app.routes.chat import router as chat_router
from app.routes.analytics import router as analytics_router
from app.services.change_stream import start_change_stream, stop_change_stream
from app.websocket.manager import ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    db = get_db()
    logger.info(f"Connected to MongoDB: {settings.database_name}")

    try:
        await start_change_stream(db)
    except Exception as e:
        logger.warning(f"Change Stream not available (requires replica set): {e}")

    yield

    await stop_change_stream()
    await close_client()
    logger.info("Shutdown complete")


app = FastAPI(
    title="Real-Time Engagement Engine",
    description="Replaces CDP (Tealium), Personalization (Adobe Target), and Behavioral Analytics (ContentSquare)",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(track_router, prefix="/api", tags=["Tracking"])
app.include_router(offers_router, prefix="/api", tags=["Offers"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])
app.include_router(analytics_router, prefix="/api", tags=["Analytics"])


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    user_id = websocket.query_params.get("userId", None)
    await ws_manager.connect(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"WS received: {data}")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket disconnected: user={user_id}")


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "engagement-engine"}


@app.post("/api/reset-demo")
async def reset_demo():
    """Reset the auto-offer trigger state so friction can fire offers again."""
    from app.routes.track import _offer_already_triggered
    _offer_already_triggered.clear()
    return {"status": "ok", "message": "Demo state reset — friction will trigger offers again"}
