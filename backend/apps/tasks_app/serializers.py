from rest_framework import serializers
from .models import Task, Group
from apps.chats.models import ChatRoom

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name', 'event']

class TaskSerializer(serializers.ModelSerializer):
    assignee_detail = serializers.SerializerMethodField(read_only=True)
    class Meta:
        model = Task
        fields = ['id', 'title', 'description', 'due_date', 'status', 'priority', 'event', 'group', 'assignee', 'assignee_detail', 'room', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        event = attrs.get('event') or getattr(self.instance, 'event', None)
        room = attrs.get('room') or getattr(self.instance, 'room', None)
        if room and event and room.event_id != event.id:
            raise serializers.ValidationError('Room must belong to the same event')
        return attrs

    def get_assignee_detail(self, obj):
        u = obj.assignee
        if not u:
            return None
        return {
            'id': u.id,
            'username': getattr(u, 'username', None),
            'email': getattr(u, 'email', None),
        }
