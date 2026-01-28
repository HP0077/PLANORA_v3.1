from django.db import models
from django.contrib.auth.models import User
from apps.events.models import Event


class Rule(models.Model):
    """Declarative automation rule bound to a trigger and optional event."""

    name = models.CharField(max_length=200)
    trigger = models.CharField(max_length=200)
    conditions = models.JSONField(default=dict, blank=True)
    actions = models.JSONField(default=list, blank=True)
    requires_confirmation = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='automation_rules')
    event = models.ForeignKey(Event, on_delete=models.CASCADE, null=True, blank=True, related_name='automation_rules')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        scope = f"event={self.event_id}" if self.event_id else 'global'
        return f"{self.trigger} -> {self.name} ({scope})"
