import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.exceptions import DenyConnection
from django.contrib.auth.models import AnonymousUser, User
from django.db import models
from django.conf import settings
import jwt
from .models import Task


class TaskConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.event_id = self.scope['url_route']['kwargs']['event_id']
        self.group_name = f"tasks_{self.event_id}"
        user = await self._authenticate()
        if user is None or isinstance(user, AnonymousUser):
            raise DenyConnection("Unauthorized")
        self.scope['user'] = user
        if not await self._can_view_event(user.id):
            raise DenyConnection("Forbidden")
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        # Read-only channel; ignore client messages
        return

    async def task_event(self, event):
        await self.send(text_data=json.dumps({
            "type": "task",
            "action": event.get('action'),
            "task": event.get('task'),
            "task_id": event.get('task_id'),
        }))

    async def _authenticate(self):
        token = None
        try:
            qs = self.scope.get('query_string', b'').decode()
            for part in qs.split('&'):
                if part.startswith('token='):
                    token = part.split('=', 1)[1]
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
    def _can_view_event(self, user_id):
        # Owner of the event or assignee of any task in the event
        return Task.objects.filter(event_id=self.event_id).filter(
            models.Q(event__owner_id=user_id) | models.Q(assignee_id=user_id)
        ).exists()
