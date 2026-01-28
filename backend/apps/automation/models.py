from django.db import models


class AutomationLog(models.Model):
    """Stores automation trigger executions for downstream processing."""

    trigger = models.CharField(max_length=200)
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f"{self.trigger} @ {self.created_at.isoformat()}"
