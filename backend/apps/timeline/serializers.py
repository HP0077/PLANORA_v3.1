from rest_framework import serializers
from django.contrib.auth.models import User
from .models import TimelineEntry


class UserMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class TimelineEntrySerializer(serializers.ModelSerializer):
    actor = UserMiniSerializer(read_only=True)

    class Meta:
        model = TimelineEntry
        fields = ['id', 'event', 'actor', 'type', 'source', 'payload', 'created_at']
        read_only_fields = fields
