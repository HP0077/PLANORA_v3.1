from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db.models import Prefetch
from django.utils.dateparse import parse_datetime
from .models import TimelineEntry
from .serializers import TimelineEntrySerializer
from .permissions import IsEventOwnerOrParticipant


class TimelineViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = TimelineEntrySerializer
    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]

    def _event_id(self):
        return self.kwargs.get('event_id') or self.request.query_params.get('event')

    def get_queryset(self):
        user = self.request.user
        params = self.request.query_params
        event_id = self._event_id()
        qs = TimelineEntry.objects.select_related('actor', 'event')
        if event_id:
            qs = qs.filter(event_id=event_id)
        type_filter = params.get('type')
        if type_filter:
            qs = qs.filter(type=type_filter)
        user_filter = params.get('user')
        if user_filter:
            qs = qs.filter(actor_id=user_filter)
        since = params.get('since')
        if since:
            dt = parse_datetime(since)
            if dt:
                qs = qs.filter(created_at__gte=dt)
        until = params.get('until')
        if until:
            dt = parse_datetime(until)
            if dt:
                qs = qs.filter(created_at__lte=dt)
        return qs.order_by('-created_at')


class EventTimelineViewSet(TimelineViewSet):
    """Nested event timeline endpoint at /api/events/<event_id>/timeline/."""

    def get_queryset(self):
        return super().get_queryset()
