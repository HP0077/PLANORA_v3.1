from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('manager', 'Event Manager'),
        ('attendee', 'Attendee'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='attendee')
    # Persist UX state
    last_viewed_group_id = models.IntegerField(null=True, blank=True)
    last_scroll_position = models.IntegerField(default=0)
    drafts = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"
