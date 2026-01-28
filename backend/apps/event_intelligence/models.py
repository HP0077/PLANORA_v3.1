from django.db import models
from apps.events.models import Event


class EventProfile(models.Model):
    """Aggregated intelligence profile per event."""

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name='intelligence_profile')
    risk_score = models.FloatField(default=0)
    readiness_score = models.FloatField(default=1)
    engagement_score = models.IntegerField(default=0)
    overdue_tasks = models.IntegerField(default=0)
    budget_variance = models.FloatField(default=0)
    inactivity_days = models.IntegerField(default=0)
    missing_meeting = models.BooleanField(default=False)
    last_computed_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"EventProfile(event={self.event_id}, risk={self.risk_score:.2f})"
