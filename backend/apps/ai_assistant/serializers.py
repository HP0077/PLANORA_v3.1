from rest_framework import serializers


class AskSerializer(serializers.Serializer):
    """Validates AI assistant question payload."""

    event_id = serializers.IntegerField(required=True)
    question = serializers.CharField(required=True, max_length=500)
    conversation_id = serializers.IntegerField(required=False, allow_null=True)

    def validate_question(self, value: str) -> str:
        text = (value or '').strip()
        if not text:
            raise serializers.ValidationError('Question cannot be empty')
        return text


class GenerateDescriptionSerializer(serializers.Serializer):
    """Validates AI event description generator payload."""

    event_name = serializers.CharField(required=True, max_length=200)
    event_type = serializers.CharField(required=False, max_length=100, default='')
    audience = serializers.CharField(required=False, max_length=200, default='')
    keywords = serializers.CharField(required=False, max_length=300, default='')
    tone = serializers.ChoiceField(
        choices=[('professional', 'Professional'), ('casual', 'Casual'), ('exciting', 'Exciting'), ('formal', 'Formal')],
        default='professional',
        required=False,
    )


class SuggestTasksSerializer(serializers.Serializer):
    """Validates AI task suggestion payload."""

    event_id = serializers.IntegerField(required=True)
    additional_context = serializers.CharField(required=False, max_length=300, default='')


class EventSummarySerializer(serializers.Serializer):
    """Validates AI event summary/report payload."""

    event_id = serializers.IntegerField(required=True)
    format = serializers.ChoiceField(
        choices=[('brief', 'Brief'), ('detailed', 'Detailed')],
        default='brief',
        required=False,
    )


class RiskMitigationSerializer(serializers.Serializer):
    """Validates AI risk mitigation suggestion payload."""

    event_id = serializers.IntegerField(required=True)


class DraftEmailSerializer(serializers.Serializer):
    """Validates AI email / invitation drafter payload."""

    event_id = serializers.IntegerField(required=True)
    template_type = serializers.ChoiceField(
        choices=[
            ('invitation', 'Invitation'),
            ('reminder', 'Reminder'),
            ('thank_you', 'Thank You'),
            ('follow_up', 'Follow Up'),
            ('cancellation', 'Cancellation'),
            ('update', 'Event Update'),
        ],
        required=True,
    )
    recipient_name = serializers.CharField(required=False, max_length=100, default='')
    additional_notes = serializers.CharField(required=False, max_length=300, default='')
    tone = serializers.ChoiceField(
        choices=[
            ('professional', 'Professional'),
            ('casual', 'Casual'),
            ('formal', 'Formal'),
            ('friendly', 'Friendly'),
        ],
        default='professional',
        required=False,
    )
