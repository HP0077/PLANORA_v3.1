import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.exceptions import DenyConnection
from django.contrib.auth.models import AnonymousUser, User
from django.conf import settings
import jwt
from .models import PosterDraft

class PosterDraftConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.draft_id = self.scope['url_route']['kwargs']['draft_id']
        self.group_name = f"poster_{self.draft_id}"
        user = await self._authenticate()
        if user is None or isinstance(user, AnonymousUser):
            raise DenyConnection("Unauthorized")
        self.scope['user'] = user
        if not await self._can_view(user.id):
            raise DenyConnection("Forbidden")
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        data = json.loads(text_data or '{}')
        t = data.get('type')
        if t in {'presence', 'lock', 'unlock'}:
            await self.channel_layer.group_send(self.group_name, {"type": "poster_event", **data, "user_id": self.scope['user'].id})

    async def poster_event(self, event):
        await self.send(text_data=json.dumps(event))

    async def _authenticate(self):
        token = None
        try:
            qs = self.scope.get('query_string', b'').decode()
            for part in qs.split('&'):
                if part.startswith('token='):
                    token = part.split('=',1)[1]
                    break
        except Exception:
            token = None
        if not token:
            headers = dict(self.scope.get('headers', []) or [])
            auth = headers.get(b'authorization')
            if auth and auth.lower().startswith(b'bearer '):
                token = auth.split()[1].decode()
        if not token:
            return None
        try:
            algorithm = settings.SIMPLE_JWT.get('ALGORITHM', 'HS256')
            payload = jwt.decode(token, settings.SIMPLE_JWT.get('SIGNING_KEY', settings.SECRET_KEY), algorithms=[algorithm])
            user_id = payload.get(settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id'))
            return await self._get_user(user_id)
        except Exception:
            return None

    @database_sync_to_async
    def _get_user(self, user_id):
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def _can_view(self, user_id):
        try:
            d = PosterDraft.objects.select_related('owner','event__owner','room__event__owner').get(id=self.draft_id)
        except PosterDraft.DoesNotExist:
            return False
        if d.owner_id == user_id:
            return True
        if d.event and d.event.owner_id == user_id:
            return True
        if d.room and (d.room.event.owner_id == user_id or d.room.memberships.filter(user_id=user_id).exists()):
            return True
        return False
