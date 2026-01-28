from rest_framework.permissions import BasePermission
from apps.events.models import Event


class IsEventOwnerOrParticipant(BasePermission):
    """Allow only event owner or participants to access the AI assistant."""

    def has_permission(self, request, view):
        event_id = None
        if request.method in ('POST', 'PUT', 'PATCH'):
            event_id = request.data.get('event_id') or request.data.get('event')
        else:
            event_id = request.query_params.get('event') or request.query_params.get('event_id')
        if not event_id:
            return False
        try:
            event = Event.objects.get(id=event_id)
        except Event.DoesNotExist:
            return False
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if event.owner_id == user.id:
            return True
        return event.participants.filter(id=user.id).exists()
