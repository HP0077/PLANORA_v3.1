"""Celery tasks for notification delivery."""
from __future__ import annotations

import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.notifications.tasks.send_pending_notifications')
def send_pending_notifications():
    """
    Periodic task: process any notifications that need external delivery
    (email, push). Currently logs for observability; plug in email backend
    when SMTP is configured.
    """
    from .models import Notification

    pending = Notification.objects.filter(is_read=False).select_related('recipient')[:50]
    count = pending.count()
    if count:
        logger.info("notifications.send_pending: %d unread notifications queued", count)
    return count
