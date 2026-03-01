import logging

from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from .models import Event
from django.db.models import Q
from .serializers import EventSerializer
from django.utils import timezone
from apps.event_intelligence.services import compute_event_profile, compute_event_profiles
from apps.event_intelligence.serializers import EventProfileSerializer

logger = logging.getLogger(__name__)

class EventViewSet(viewsets.ModelViewSet):
    serializer_class = EventSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        u = self.request.user
        return (
            Event.objects
            .select_related('owner')
            .prefetch_related('participants')
            .filter(Q(owner=u) | Q(participants=u))
            .distinct()
            .order_by('-created_at')
        )

    def perform_create(self, serializer):
        event = serializer.save(owner=self.request.user)
        # simple placeholder link generation; integrate Google/Zoom later
        if event.mode == 'online' and not event.meeting_link:
            event.meeting_link = f"https://meet.example.com/{event.id}"
            event.save(update_fields=['meeting_link'])
        # participants can be set by serializer; nothing else needed

    def perform_update(self, serializer):
        # only owner can update
        instance = self.get_object()
        if instance.owner_id != self.request.user.id:
            raise PermissionDenied('Only the event owner can update this event')
        serializer.save()

    @action(detail=True, methods=['post'])
    def generate_meeting(self, request, pk=None):
        ev = self.get_object()
        # Only owner/PM can generate
        if ev.owner_id != request.user.id:
            raise PermissionDenied('Only the event owner can generate a meeting link')
        # Stub generation; integrate Google Meet API later
        ev.meeting_link = ev.meeting_link or f"https://meet.example.com/{ev.id}-{timezone.now().strftime('%H%M%S')}"
        ev.save(update_fields=['meeting_link'])
        return Response(EventSerializer(ev).data)

    @action(detail=True, methods=['get'])
    def whatsapp_share(self, request, pk=None):
        ev = self.get_object()
        text = f"Join my event: {ev.name} on {ev.date} {ev.time}. Link: {ev.meeting_link or 'N/A'}"
        from urllib.parse import quote
        return Response({
            'url': f"https://wa.me/?text={quote(text)}"
        })

    @action(detail=True, methods=['post'])
    def email_invites(self, request, pk=None):
        ev = self.get_object()
        recipients = request.data.get('recipients') or []
        # Stub: return payload; integrate actual email later
        return Response({'ok': True, 'sent_to': recipients, 'event': ev.id})

    @action(detail=False, methods=['get'])
    def upcoming(self, request):
        today = timezone.localdate()
        qs = self.get_queryset().filter(date__gte=today).order_by('date', 'time')[:50]
        return Response(EventSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def send_reminders(self, request, pk=None):
        # Stub for Celery task trigger
        return Response({'ok': True})

    @action(detail=False, methods=['get'], url_path='intelligence')
    def intelligence_bulk(self, request):
        """Return intelligence profiles for all visible events (bulk)."""
        events = list(self.get_queryset())
        profiles = compute_event_profiles(events)
        data = EventProfileSerializer(profiles, many=True).data
        return Response(data)

    @action(detail=True, methods=['get'])
    def intelligence(self, request, pk=None):
        """Compute and return the intelligence profile for this event."""
        event = self.get_object()
        profile = compute_event_profile(event)
        return Response(EventProfileSerializer(profile).data)
