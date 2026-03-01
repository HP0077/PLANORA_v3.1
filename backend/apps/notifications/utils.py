"""Utility to create notifications from anywhere in the backend."""
from __future__ import annotations

import logging
from typing import Optional

from django.contrib.auth.models import User

logger = logging.getLogger(__name__)


def create_notification(
    recipient: User,
    title: str,
    body: str = '',
    *,
    event=None,
    type: str = 'info',
) -> Optional['Notification']:
    """Create an in-app notification for a user."""
    from .models import Notification

    try:
        return Notification.objects.create(
            recipient=recipient,
            event=event,
            type=type,
            title=title,
            body=body,
        )
    except Exception:
        logger.exception("create_notification failed recipient=%s title=%s", recipient, title)
        return None


def notify_event_owner(event, title: str, body: str = '', *, type: str = 'info'):
    """Shortcut: notify the owner of an event."""
    if not event or not event.owner:
        return None
    return create_notification(event.owner, title, body, event=event, type=type)
