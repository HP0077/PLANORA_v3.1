import logging

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.db.models import Q
from .models import ChatRoom, ChatMembership, Message, MessageRead
from .serializers import ChatRoomSerializer, ChatMembershipSerializer, UserLiteSerializer, MessageSerializer
from django.utils import timezone
from datetime import timedelta
from rest_framework.exceptions import PermissionDenied
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

logger = logging.getLogger(__name__)

class IsManagerOrOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj: ChatRoom):
        return obj.event.owner_id == request.user.id

    def has_permission(self, request, view):
        return request.user and request.user.is_authenticated

class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        # Rooms where user is a member or event owner
        return ChatRoom.objects.select_related('event').filter(Q(event__owner=u) | Q(memberships__user=u)).distinct()

    def perform_create(self, serializer):
        # Only event owner can create
        event = serializer.validated_data.get('event')
        if not event or event.owner_id != self.request.user.id:
            raise PermissionDenied('Only the event owner can create a group for this event')
        serializer.save()

    def perform_destroy(self, instance: ChatRoom):
        # Only event owner can delete the group
        if instance.event.owner_id != self.request.user.id:
            raise PermissionDenied('Only the event owner can delete this group')
        instance.delete()

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsManagerOrOwner])
    def add_member(self, request, pk=None):
        room = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'detail':'user_id required'}, status=400)
        ChatMembership.objects.get_or_create(room=room, user_id=user_id)
        return Response({'ok': True})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAuthenticated, IsManagerOrOwner])
    def remove_member(self, request, pk=None):
        room = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'detail':'user_id required'}, status=400)
        ChatMembership.objects.filter(room=room, user_id=user_id).delete()
        return Response({'ok': True})

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def search_users(request):
    q = (request.GET.get('q') or '').strip()
    if not q:
        return Response({'results': []})
    users = User.objects.filter(Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q))[:20]
    return Response({'results': UserLiteSerializer(users, many=True).data})


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        room_id = self.request.query_params.get('room')
        qs = Message.objects.select_related('room__event', 'sender')
        if room_id:
            qs = qs.filter(room_id=room_id)
        # Only messages in rooms where user is member or event owner
        return qs.filter(
            Q(room__event__owner=u) | Q(room__memberships__user=u)
        ).distinct().order_by('-created_at')

    def perform_create(self, serializer):
        room = serializer.validated_data.get('room')
        u = self.request.user
        if not room:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'room': ['This field is required.']})
        is_allowed = room.event.owner_id == u.id or room.memberships.filter(user=u).exists()
        if not is_allowed:
            raise PermissionDenied('Forbidden')
        serializer.save(sender=u)

    def perform_update(self, serializer):
        instance = self.get_object()
        u = self.request.user
        is_owner = instance.room.event.owner_id == u.id
        is_sender = instance.sender_id == u.id
        if not (is_owner or is_sender):
            raise PermissionDenied('Forbidden')
        serializer.save(edited_flag=True)

    def destroy(self, request, *args, **kwargs):
        msg = self.get_object()
        u = request.user
        now = timezone.now()
        # Allow if event owner, or sender within 15 minutes
        is_owner = msg.room.event.owner_id == u.id
        is_sender_recent = (msg.sender_id == u.id) and ((now - msg.created_at) <= timedelta(minutes=15))
        if not (is_owner or is_sender_recent):
            raise PermissionDenied('You can only delete your messages within 15 minutes (or be the event owner).')

        room_id = msg.room_id
        msg_id = msg.id
        response = super().destroy(request, *args, **kwargs)

        # Broadcast deletion to room (best-effort)
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"chat_{room_id}",
                {"type": "chat_deleted", "message_id": msg_id}
            )
        except Exception:
            logger.exception("Failed to broadcast message deletion room=%s msg=%s", room_id, msg_id)

        return response

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        msg = self.get_object()
        u = request.user
        # Only members or owner can mark read (enforced by queryset)
        MessageRead.objects.get_or_create(message=msg, user=u)
        # Broadcast WS read event (best-effort)
        try:
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"chat_{msg.room_id}",
                {"type": "chat_read", "message_id": msg.id, "user_id": u.id}
            )
        except Exception:
            logger.exception("Failed to broadcast read receipt room=%s msg=%s", msg.room_id, msg.id)
        return Response({'ok': True})