from rest_framework import serializers


class AskSerializer(serializers.Serializer):
    """Validates AI assistant question payload."""

    event_id = serializers.IntegerField(required=True)
    question = serializers.CharField(required=True, max_length=500)

    def validate_question(self, value: str) -> str:
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError('Question cannot be empty')
        return text
