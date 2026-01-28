from rest_framework import serializers
from django.contrib.auth.models import User
from apps.events.models import Event
from .models import Rule


class RuleSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    event = serializers.PrimaryKeyRelatedField(queryset=Event.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Rule
        fields = ['id', 'name', 'trigger', 'conditions', 'actions', 'requires_confirmation', 'is_active', 'created_by', 'event', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def validate_actions(self, value):
        if not isinstance(value, (list, tuple)):
            raise serializers.ValidationError('Actions must be a list of action definitions.')
        for action in value:
            if not isinstance(action, dict) or 'type' not in action:
                raise serializers.ValidationError('Each action must be a dict with a "type" key.')
        return value

    def validate_conditions(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError('Conditions must be a JSON object.')
        return value

    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['created_by'] = user
        return super().create(validated_data)
