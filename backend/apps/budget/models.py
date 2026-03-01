from django.db import models
from apps.events.models import Event
from apps.chats.models import ChatRoom


class BudgetHealth(models.Model):
    """Snapshot of budget totals and health for an event."""

    STATUS_CHOICES = (
        ('OK', 'OK'),
        ('WARNING', 'Warning'),
        ('OVERSPENT', 'Overspent'),
    )

    event = models.OneToOneField(Event, on_delete=models.CASCADE, related_name='budget_health')
    total_estimated = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_actual = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    variance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default='OK')
    updated_at = models.DateTimeField(auto_now=True)

class BudgetItem(models.Model):
    TYPE = (
        ('expense', 'Expense'),
        ('income', 'Income'),
    )
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='budget_items')
    room = models.ForeignKey(ChatRoom, on_delete=models.SET_NULL, null=True, blank=True, related_name='budget_items')
    type = models.CharField(max_length=10, choices=TYPE)
    title = models.CharField(max_length=200)
    estimated = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    actual = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['event', 'type']),
            models.Index(fields=['event', '-created_at']),
        ]
