from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, List, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time push notifications."""

    def __init__(self):
        self._connections: Dict[str, List[WebSocket]] = {}
        self._broadcast_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, user_id: Optional[str] = None):
        await websocket.accept()
        if user_id:
            self._connections.setdefault(user_id, []).append(websocket)
        self._broadcast_connections.append(websocket)
        logger.info(f"WebSocket connected: user={user_id}, total={len(self._broadcast_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: Optional[str] = None):
        if user_id and user_id in self._connections:
            self._connections[user_id] = [
                ws for ws in self._connections[user_id] if ws != websocket
            ]
        self._broadcast_connections = [
            ws for ws in self._broadcast_connections if ws != websocket
        ]

    async def send_to_user(self, user_id: str, message: dict):
        connections = self._connections.get(user_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, user_id)

    async def broadcast(self, message: dict):
        dead = []
        for ws in self._broadcast_connections:
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = ConnectionManager()
