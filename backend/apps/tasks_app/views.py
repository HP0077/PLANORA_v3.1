import logging

from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from django.db import models
from django.db.models import Q
from django.utils import timezone
from .models import Task, Group
from .serializers import TaskSerializer, GroupSerializer
from apps.chats.models import ChatRoom, ChatMembership
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------

class IsEventOwner(permissions.BasePermission):
    """Allow only the owner of the related event."""

    def has_object_permission(self, request, view, obj):
        return obj.event.owner_id == request.user.id


class IsEventOwnerOrAssignee(permissions.BasePermission):
    """Allow the event owner full access; assignee gets read + status-only write."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if obj.event.owner_id == user.id:
            return True
        if obj.assignee_id == user.id:
            return True
        return False


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer
    permission_classes = [permissions.IsAuthenticated, IsEventOwner]

    def get_queryset(self):
        return Group.objects.filter(event__owner=self.request.user)

    def perform_create(self, serializer):
        event = serializer.validated_data.get('event')
        if not event or event.owner_id != self.request.user.id:
            raise PermissionDenied('You cannot create a group for this event')
        serializer.save()

    def perform_update(self, serializer):
        event = serializer.validated_data.get('event') or serializer.instance.event
        if event.owner_id != self.request.user.id:
            raise PermissionDenied('You cannot modify a group for this event')
        serializer.save()


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsEventOwnerOrAssignee]

    def get_queryset(self):
        u = self.request.user
        # Tasks visible to:
        # - Event owner: all tasks for their events
        # - Attendee: only tasks assigned to them
        qs = (
            Task.objects
            .select_related('assignee', 'event')
            .filter(Q(event__owner=u) | Q(assignee=u))
            .distinct()
        )
        # Order by priority (high first), then recent
        priority_order = models.Case(
            models.When(priority='high', then=models.Value(0)),
            models.When(priority='medium', then=models.Value(1)),
            models.When(priority='low', then=models.Value(2)),
            default=models.Value(3),
            output_field=models.IntegerField(),
        )
        return qs.order_by(priority_order, '-created_at')

    def perform_create(self, serializer):
        event = serializer.validated_data.get('event')
        if not event or event.owner_id != self.request.user.id:
            raise PermissionDenied('You cannot create a task for this event')
        instance = serializer.save()
        broadcast_task_event(event.id, 'created', instance)

    def perform_update(self, serializer):
        instance = serializer.instance
        event = serializer.validated_data.get('event') or instance.event
        u = self.request.user
        new_status = serializer.validated_data.get('status')

        # Owner can update anything
        if event.owner_id == u.id:
            instance = _save_with_completion(serializer, new_status)
            broadcast_task_event(event.id, 'updated', instance)
            return
        # Assignee can only update status
        if instance.assignee_id == u.id:
            allowed = {'status'}
            # Filter fields to only allowed
            clean_data = {k: v for k, v in serializer.validated_data.items() if k in allowed}
            if not clean_data:
                raise PermissionDenied('Only status can be updated by the assignee')
            update_fields = list(clean_data.keys())
            for k, v in clean_data.items():
                setattr(instance, k, v)
            # Auto-set completed_at on done transition
            if clean_data.get('status') == 'done' and instance.completed_at is None:
                instance.completed_at = timezone.now()
                update_fields.append('completed_at')
            elif clean_data.get('status') != 'done' and instance.completed_at is not None:
                instance.completed_at = None
                update_fields.append('completed_at')
            instance.save(update_fields=update_fields)
            broadcast_task_event(event.id, 'updated', instance)
            return
        raise PermissionDenied('You cannot modify this task')

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if task.event.owner_id != request.user.id:
            raise PermissionDenied('Only the event owner can delete a task')
        event_id = task.event_id
        broadcast_task_event(event_id, 'deleted', task)
        return super().destroy(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _save_with_completion(serializer, new_status):
    """Save via serializer and auto-manage the completed_at timestamp."""
    instance = serializer.save()
    changed = False
    if new_status == 'done' and instance.completed_at is None:
        instance.completed_at = timezone.now()
        changed = True
    elif new_status is not None and new_status != 'done' and instance.completed_at is not None:
        instance.completed_at = None
        changed = True
    if changed:
        instance.save(update_fields=['completed_at'])
    return instance


def broadcast_task_event(event_id, action, task_instance):
    layer = get_channel_layer()
    if not layer:
        return
    try:
        payload = TaskSerializer(task_instance).data if action != 'deleted' else {'id': task_instance.id, 'event': task_instance.event_id}
        async_to_sync(layer.group_send)(
            f"tasks_{event_id}",
            {
                'type': 'task_event',
                'action': action,
                'task': payload,
                'task_id': task_instance.id,
            }
        )
    except Exception:
        logger.exception("Failed to broadcast task event action=%s task=%s event=%s", action, task_instance.id, event_id)
