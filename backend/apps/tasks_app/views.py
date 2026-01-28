from rest_framework import viewsets, permissions
from django.db import models
from django.db.models import Q
from .models import Task, Group
from .serializers import TaskSerializer, GroupSerializer
from apps.chats.models import ChatRoom, ChatMembership

class GroupViewSet(viewsets.ModelViewSet):
    serializer_class = GroupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Group.objects.filter(event__owner=self.request.user)

    def perform_create(self, serializer):
        event = serializer.validated_data.get('event')
        if not event or event.owner_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You cannot create a group for this event')
        serializer.save()

    def perform_update(self, serializer):
        event = serializer.validated_data.get('event') or serializer.instance.event
        if event.owner_id != self.request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You cannot modify a group for this event')
        serializer.save()

class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        # Tasks visible to:
        # - Event owner: all tasks for their events
        # - Attendee: only tasks assigned to them
        qs = Task.objects.filter(Q(event__owner=u) | Q(assignee=u)).distinct()
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
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You cannot create a task for this event')
        serializer.save()

    def perform_update(self, serializer):
        instance = serializer.instance
        event = serializer.validated_data.get('event') or instance.event
        u = self.request.user
        # Owner can update anything
        if event.owner_id == u.id:
            serializer.save()
            return
        # Assignee can only update status
        if instance.assignee_id == u.id:
            allowed = {'status'}
            # Filter fields to only allowed
            clean_data = {k: v for k, v in serializer.validated_data.items() if k in allowed}
            if not clean_data:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Only status can be updated by the assignee')
            for k, v in clean_data.items():
                setattr(instance, k, v)
            instance.save(update_fields=list(clean_data.keys()))
            return
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You cannot modify this task')

    def destroy(self, request, *args, **kwargs):
        task = self.get_object()
        if task.event.owner_id != request.user.id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the event owner can delete a task')
        return super().destroy(request, *args, **kwargs)
