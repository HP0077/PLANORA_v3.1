from rest_framework import serializers
from .models import BudgetItem
from apps.chats.models import ChatRoom

class BudgetItemSerializer(serializers.ModelSerializer):
    event_status = serializers.CharField(source='event.status', read_only=True)

    class Meta:
        model = BudgetItem
        fields = ['id', 'event', 'room', 'type', 'title', 'estimated', 'actual', 'created_at', 'event_status']
        read_only_fields = ['id', 'created_at', 'event_status']

    def validate(self, attrs):
        event = attrs.get('event') or getattr(self.instance, 'event', None)
        room = attrs.get('room') or getattr(self.instance, 'room', None)
        if room and event and room.event_id != event.id:
            raise serializers.ValidationError('Room must belong to the same event')
        return attrs
