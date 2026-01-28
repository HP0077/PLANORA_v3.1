from rest_framework import serializers
from .models import EventProfile


class EventProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventProfile
        fields = [
            'event', 'risk_score', 'readiness_score', 'engagement_score',
            'overdue_tasks', 'budget_variance', 'inactivity_days', 'missing_meeting',
            'last_computed_at'
        ]
        read_only_fields = fields
