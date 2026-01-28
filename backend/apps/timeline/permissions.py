from rest_framework.permissions import BasePermission
from apps.events.models import Event


class IsEventOwnerOrParticipant(BasePermission):
    def has_permission(self, request, view):
        event_id = (
            getattr(view, 'kwargs', {}).get('event_id')
            or request.query_params.get('event')
            or request.data.get('event')
        )
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
