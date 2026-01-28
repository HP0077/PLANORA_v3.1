import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from channels.exceptions import DenyConnection
from django.contrib.auth.models import AnonymousUser
from .models import ChatRoom, Message
import jwt
from django.conf import settings
from django.utils import timezone
from datetime import timedelta

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.group_name = f"chat_{self.room_id}"
        # Authenticate via JWT in querystring (?token=) or header (subprotocols not used here)
        user = await self._authenticate()
        if user is None or isinstance(user, AnonymousUser):
            raise DenyConnection("Unauthorized")
        self.scope['user'] = user
        # Membership check: only members or event owner can connect
        if not await self._is_member(user.id):
            raise DenyConnection("Forbidden")
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        data = json.loads(text_data)
        # Typing indicator messages are transient and not stored
        if data.get('type') == 'typing':
            user = self.scope.get('user')
            if not user or isinstance(user, AnonymousUser):
                return
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "chat_typing",
                    "typing": True,
                    "user": {"id": user.id, "username": getattr(user, 'username', str(user.id))}
                }
            )
            return

        # Deletion path
        if data.get('type') == 'delete':
            user = self.scope.get('user')
            msg_id = data.get('message_id')
            if not user or not msg_id:
                return
            deleted = await self._delete_message(user.id, msg_id)
            if deleted:
                await self.channel_layer.group_send(
                    self.group_name,
                    {"type": "chat_deleted", "message_id": msg_id}
                )
            return

        content = data.get('content') or ''
        attachments = data.get('attachments') or []
        user = self.scope.get('user')
        # Allow sending if there's content or attachments
        if not content and not attachments:
            return
        if not user or isinstance(user, AnonymousUser):
            return
        msg = await self._save_message(user.id, content, attachments)
        await self.channel_layer.group_send(
            self.group_name,
            {"type": "chat_message", "message": {"id": msg.id, "content": msg.content, "attachments": msg.attachments, "sender_id": msg.sender_id, "created_at": msg.created_at.isoformat(), "type": "message"}}
        )

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event['message']))

    async def chat_deleted(self, event):
        await self.send(text_data=json.dumps({"type": "deleted", "message_id": event.get('message_id')}))

    async def chat_typing(self, event):
        # Forward typing status to clients
        await self.send(text_data=json.dumps({
            "type": "typing",
            "typing": bool(event.get('typing')),
            "user": event.get('user')
        }))

    async def chat_read(self, event):
        await self.send(text_data=json.dumps({
            "type": "read",
            "message_id": event.get('message_id'),
            "user_id": event.get('user_id')
        }))

    @database_sync_to_async
    def _save_message(self, user_id, content, attachments):
        room = ChatRoom.objects.select_related('event__owner').get(id=self.room_id)
        is_member = room.memberships.filter(user_id=user_id).exists() or room.event.owner_id == user_id
        if not is_member:
            raise PermissionError("Forbidden")
        return Message.objects.create(room=room, sender_id=user_id, content=content, attachments=attachments)

    @database_sync_to_async
    def _delete_message(self, user_id, message_id):
        try:
            msg = Message.objects.select_related('room__event').get(id=message_id, room_id=self.room_id)
        except Message.DoesNotExist:
            return False
        now = timezone.now()
        is_owner = msg.room.event.owner_id == user_id
        is_sender_recent = (msg.sender_id == user_id) and ((now - msg.created_at) <= timedelta(minutes=15))
        if not (is_owner or is_sender_recent):
            return False
        msg.delete()
        return True

    @database_sync_to_async
    def _get_user_by_id(self, user_id):
        from django.contrib.auth.models import User
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    async def _authenticate(self):
        # Check querystring token first
        token = None
        try:
            # scope['query_string'] is bytes
            qs = self.scope.get('query_string', b'').decode()
            for part in qs.split('&'):
                if part.startswith('token='):
                    token = part.split('=', 1)[1]
                    break
        except Exception:
            token = None

        # Fallback to Authorization header from scope if provided by upstream middleware (not typical)
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
            return await self._get_user_by_id(user_id)
        except Exception:
            return None

    @database_sync_to_async
    def _is_member(self, user_id):
        try:
            room = ChatRoom.objects.select_related('event__owner').get(id=self.room_id)
        except ChatRoom.DoesNotExist:
            return False
        return room.event.owner_id == user_id or room.memberships.filter(user_id=user_id).exists()
