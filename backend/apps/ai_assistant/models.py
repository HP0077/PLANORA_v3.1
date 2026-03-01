from django.db import models
from django.contrib.auth.models import User
from apps.events.models import Event


class Conversation(models.Model):
    """A multi-turn AI conversation scoped to a user + event."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ai_conversations')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='ai_conversations')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'event']),
        ]

    def __str__(self):
        return f"Conversation(user={self.user_id}, event={self.event_id})"


class ConversationMessage(models.Model):
    """Single turn in a conversation."""

    ROLE_CHOICES = (
        ('user', 'User'),
        ('assistant', 'Assistant'),
    )

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role}] {self.content[:60]}"
