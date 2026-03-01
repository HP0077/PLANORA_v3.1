"""Celery tasks for Event Intelligence Engine."""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.event_intelligence.tasks.recompute_all_profiles')
def recompute_all_profiles():
    """Periodic task: recompute intelligence profiles for all active events."""
    from apps.events.models import Event
    from .services import compute_event_profiles

    active_statuses = ['DRAFT', 'PLANNING', 'LIVE']
    active_events = list(Event.objects.filter(status__in=active_statuses))

    if not active_events:
        logger.info("intelligence.recompute: no active events")
        return 0

    profiles = compute_event_profiles(active_events)
    logger.info("intelligence.recompute: updated %d profiles", len(profiles))
    return len(profiles)
