from __future__ import annotations

from typing import Any, Dict, List, Optional
from django.utils import timezone
from django.contrib.auth.models import User
from django.db import transaction

from apps.chats.models import Message
from apps.tasks_app.models import Task
from apps.events.models import Event
from apps.automation.models import AutomationLog


def _get_event(event_id: Optional[int]) -> Optional[Event]:
    if not event_id:
        return None
    try:
        return Event.objects.select_related('owner').prefetch_related('chat_rooms').get(id=event_id)
    except Event.DoesNotExist:
        return None


def _event_chat_room(event: Event):
    if not event:
        return None
    return event.chat_rooms.order_by('id').first()


def post_chat(event_id: Optional[int], message: str) -> None:
    event = _get_event(event_id)
    room = _event_chat_room(event) if event else None
    if not room:
        return
    Message.objects.create(room=room, sender=None, content=message, attachments=[{'type': 'system', 'ts': timezone.now().isoformat()}])
    AutomationLog.objects.create(trigger='rule_action:post_chat', payload={'event': event_id, 'message': message})


def create_task(event_id: Optional[int], title: str, assignee_id: Optional[int] = None) -> None:
    if not event_id:
        return
    defaults = {'event_id': event_id, 'title': title}
    if assignee_id:
        defaults['assignee_id'] = assignee_id
    # Idempotent-ish: avoid duplicates by using get_or_create on title/event/assignee
    Task.objects.get_or_create(event_id=event_id, title=title, assignee_id=assignee_id, defaults=defaults)
    AutomationLog.objects.create(trigger='rule_action:create_task', payload={'event': event_id, 'title': title, 'assignee': assignee_id})


def change_status(event_id: Optional[int], status: str) -> None:
    if not event_id:
        return
    try:
        with transaction.atomic():
            ev = Event.objects.select_for_update().get(id=event_id)
            if ev.status == status:
                return
            ev.status = status
            ev.save(update_fields=['status'])
            AutomationLog.objects.create(trigger='rule_action:change_status', payload={'event': event_id, 'status': status})
    except Event.DoesNotExist:
        return


def notify_owner(event_id: Optional[int], subject: str, body: str) -> None:
    event = _get_event(event_id)
    if not event:
        return
    # Stub: align with existing email_invites behavior (no actual send)
    AutomationLog.objects.create(trigger='rule_action:notify_owner', payload={'event': event_id, 'subject': subject, 'body': body, 'owner': event.owner_id})


def dispatch_actions(
    event_id: Optional[int],
    actions: List[Dict[str, Any]],
    *,
    requires_confirmation: bool = False,
    confirmed: bool = False,
) -> None:
    for action in actions:
        if not isinstance(action, dict):
            continue
        action_type = action.get('type')
        if action_type == 'post_chat':
            post_chat(event_id, action.get('message') or '')
        elif action_type == 'create_task':
            if requires_confirmation and not confirmed:
                AutomationLog.objects.create(trigger='rule_action:skipped_confirmation', payload={'event': event_id, 'action': action_type})
                continue
            create_task(event_id, action.get('title') or 'Automation Task', action.get('assignee'))
        elif action_type == 'change_status':
            status = action.get('status')
            if status:
                if requires_confirmation and not confirmed:
                    AutomationLog.objects.create(trigger='rule_action:skipped_confirmation', payload={'event': event_id, 'action': action_type, 'status': status})
                    continue
                change_status(event_id, status)
        elif action_type == 'notify_owner':
            notify_owner(event_id, action.get('subject') or 'Notification', action.get('body') or '')
        else:
            # Unknown action; ignore but log
            AutomationLog.objects.create(trigger='rule_action:unknown', payload={'event': event_id, 'action': action_type})
