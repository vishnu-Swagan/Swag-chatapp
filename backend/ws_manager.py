from typing import Dict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.active[user_id] = ws

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)

    async def send(self, user_id: str, data: dict) -> bool:
        ws = self.active.get(user_id)
        if not ws:
            return False
        try:
            await ws.send_json(data)
            return True
        except Exception:
            self.active.pop(user_id, None)
            return False


manager = ConnectionManager()
