from rest_framework import serializers
from .models import Event
from django.contrib.auth.models import User
from apps.users.serializers import UserLiteSerializer
from apps.event_intelligence.services import compute_event_profile
from apps.event_intelligence.serializers import EventProfileSerializer

class EventSerializer(serializers.ModelSerializer):
    owner_id = serializers.IntegerField(source='owner.id', read_only=True)
    participants = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), many=True, required=False)
    participants_detail = UserLiteSerializer(source='participants', many=True, read_only=True)
    intelligence = serializers.SerializerMethodField()

    def get_intelligence(self, obj):
        # Return cached profile if present; otherwise compute and persist on the fly.
        profile = getattr(obj, 'intelligence_profile', None)
        if profile is None:
            profile = compute_event_profile(obj)
        return EventProfileSerializer(profile).data
    class Meta:
        model = Event
        fields = ['id', 'name', 'description', 'date', 'time', 'mode', 'status', 'meeting_link', 'participants', 'participants_detail', 'owner_id', 'created_at', 'intelligence']
        read_only_fields = ['id', 'created_at', 'meeting_link', 'owner_id', 'intelligence']
