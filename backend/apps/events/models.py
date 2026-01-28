from django.db import models
from django.contrib.auth.models import User

class Event(models.Model):
    MODE_CHOICES = (
        ('online', 'Online'),
        ('offline', 'Offline'),
    )
    STATUS_CHOICES = (
        ('DRAFT', 'Draft'),
        ('PLANNING', 'Planning'),
        ('LIVE', 'Live'),
        ('COMPLETED', 'Completed'),
        ('ARCHIVED', 'Archived'),
    )
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='events')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    date = models.DateField()
    time = models.TimeField()
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default='offline')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    meeting_link = models.URLField(blank=True)
    participants = models.ManyToManyField(User, related_name='participating_events', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name
