from django.contrib import admin
from .models import EventProfile


@admin.register(EventProfile)
class EventProfileAdmin(admin.ModelAdmin):
    list_display = ('event', 'risk_score', 'readiness_score', 'engagement_score', 'overdue_tasks', 'budget_variance', 'inactivity_days', 'missing_meeting', 'last_computed_at')
    search_fields = ('event__name',)
    list_filter = ('missing_meeting',)
