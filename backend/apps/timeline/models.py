from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from apps.events.models import Event


class TimelineEntry(models.Model):
    TYPE_CHOICES = (
        ('event_status', 'Event status change'),
        ('task_created', 'Task created'),
        ('task_updated', 'Task updated'),
        ('task_completed', 'Task completed'),
        ('budget_item_created', 'Budget item created'),
        ('budget_item_updated', 'Budget item updated'),
        ('budget_item_deleted', 'Budget item deleted'),
        ('automation', 'Automation trigger'),
        ('automation_rule', 'Automation rule action'),
        ('certificate_generated', 'Certificate generated'),
        ('certificate_batch_submitted', 'Certificate batch submitted'),
        ('certificate_batch_completed', 'Certificate batch completed'),
        ('certificate_batch_failed', 'Certificate batch failed'),
        ('chat_system', 'Chat system message'),
        ('file_uploaded', 'File uploaded'),
        ('poster_edit', 'Poster edit/lock'),
        ('user_joined', 'User joined'),
        ('user_left', 'User left'),
        ('ai_query', 'AI assistant query'),
        ('ai_response', 'AI assistant response'),
    )

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='timeline_entries')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='timeline_entries')
    type = models.CharField(max_length=64, choices=TYPE_CHOICES)
    source = models.CharField(max_length=128)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event', '-created_at']),
        ]

    def __str__(self):
        who = self.actor.username if self.actor else 'SYSTEM'
        return f"{self.type} {who} @ {self.created_at.isoformat()}"

    def clean(self):
        """Enforce append-only semantics and normalize payload metadata."""
        if self.pk and self.__class__.objects.filter(pk=self.pk).exists():
            raise ValidationError('TimelineEntry is append-only; updates are not allowed.')
        # Ensure payload carries required audit metadata
        payload = self.payload or {}
        payload.setdefault('snapshot', {})
        self.payload = payload

    def save(self, *args, **kwargs):
        # Prevent updates by rejecting saves on existing rows
        if self.pk and self.__class__.objects.filter(pk=self.pk).exists():
            raise ValidationError('TimelineEntry is append-only; updates are not allowed.')
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError('TimelineEntry is append-only; deletes are not allowed.')
