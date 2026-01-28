from __future__ import annotations

from django.db.models.signals import post_save, m2m_changed, pre_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.models import User
from decimal import Decimal
from datetime import date, datetime

from apps.events.models import Event
from apps.tasks_app.models import Task
from apps.budget.models import BudgetItem
from apps.automation.models import AutomationLog
from apps.chats.models import Message, ChatMembership
from apps.files.models import FileAsset
from apps.poster.models import PosterDraft, CertificateRecord
from .models import TimelineEntry


SYSTEM_ACTOR = None


def _snapshot(instance, fields):
    if instance is None:
        return {}
    snap = {}
    for field in fields:
        value = getattr(instance, field, None)
        if isinstance(value, Decimal):
            snap[field] = str(value)
        elif isinstance(value, (date, datetime)):
            snap[field] = value.isoformat()
        else:
            snap[field] = value
    return snap


def _log(event_id, type_, source, payload, actor=None):
    if not event_id:
        return
    payload = payload or {}
    payload.setdefault('snapshot', {})
    TimelineEntry.objects.create(event_id=event_id, actor=actor, type=type_, source=source, payload=payload)


# Event status changes
@receiver(pre_save, sender=Event)
def _store_old_status(sender, instance: Event, **kwargs):
    if instance.pk:
        try:
            instance._old_status = sender.objects.get(pk=instance.pk).status
        except sender.DoesNotExist:
            instance._old_status = None


@receiver(post_save, sender=Event)
def _timeline_event_status(sender, instance: Event, created, **kwargs):
    if created:
        return
    old = getattr(instance, '_old_status', None)
    if old and old != instance.status:
        _log(
            instance.id,
            'event_status',
            'event',
            {
                'from': old,
                'to': instance.status,
                'snapshot': _snapshot(instance, ['name', 'status']),
            },
            actor=None,
        )


# Track previous task status for transition auditing
@receiver(pre_save, sender=Task)
def _store_old_task_status(sender, instance: Task, **kwargs):
    if instance.pk:
        try:
            instance._old_status = sender.objects.get(pk=instance.pk).status
        except sender.DoesNotExist:
            instance._old_status = None


# Task changes
@receiver(post_save, sender=Task)
def _timeline_task(sender, instance: Task, created, **kwargs):
    if created:
        _log(
            instance.event_id,
            'task_created',
            'task',
            {
                'task_id': instance.id,
                'title': instance.title,
                'status': instance.status,
                'assignee': instance.assignee_id,
                'snapshot': _snapshot(instance, ['status', 'priority', 'due_date']),
            },
            actor=instance.assignee,
        )
        return

    old_status = getattr(instance, '_old_status', instance.status)
    status_changed = old_status != instance.status
    type_ = 'task_completed' if instance.status == 'done' else 'task_updated'
    payload = {
        'task_id': instance.id,
        'title': instance.title,
        'status': instance.status,
        'assignee': instance.assignee_id,
        'snapshot': _snapshot(instance, ['status', 'priority', 'due_date']),
    }
    if status_changed:
        payload['from'] = old_status
        payload['to'] = instance.status
    _log(instance.event_id, type_, 'task', payload, actor=instance.assignee)


# Budget item changes
@receiver(post_save, sender=BudgetItem)
def _timeline_budget(sender, instance: BudgetItem, created, **kwargs):
    type_ = 'budget_item_created' if created else 'budget_item_updated'
    _log(
        instance.event_id,
        type_,
        'budget',
        {
            'budget_item_id': instance.id,
            'title': instance.title,
            'type': instance.type,
            'estimated': str(instance.estimated),
            'actual': str(instance.actual),
            'snapshot': _snapshot(instance, ['type', 'estimated', 'actual']),
        },
        actor=None,
    )


@receiver(post_delete, sender=BudgetItem)
def _timeline_budget_deleted(sender, instance: BudgetItem, **kwargs):
    _log(
        instance.event_id,
        'budget_item_deleted',
        'budget',
        {
            'budget_item_id': instance.id,
            'title': instance.title,
            'type': instance.type,
            'estimated': str(instance.estimated),
            'actual': str(instance.actual),
            'deleted': True,
            'snapshot': _snapshot(instance, ['type', 'estimated', 'actual']),
        },
        actor=None,
    )


# Automation logs -> timeline
@receiver(post_save, sender=AutomationLog)
def _timeline_automation(sender, instance: AutomationLog, created, **kwargs):
    if not created:
        return
    payload = instance.payload or {}
    event_id = payload.get('event') or payload.get('event_id')
    type_ = 'automation'
    if instance.trigger.startswith('rule_action'):
        type_ = 'automation_rule'
    rule_name = payload.get('rule_name')
    source = 'AUTOMATION'
    _log(
        event_id,
        type_,
        source,
        {
            'trigger': instance.trigger,
            'rule_name': rule_name,
            'payload': payload,
            'matched_conditions': payload.get('matched_conditions', []),
            'snapshot': {'trigger': instance.trigger},
        },
        actor=None,
    )


# Chat system messages
@receiver(post_save, sender=Message)
def _timeline_chat_system(sender, instance: Message, created, **kwargs):
    if not created:
        return
    if instance.sender_id is not None:
        return
    room = instance.room
    event_id = room.event_id if room else None
    _log(
        event_id,
        'chat_system',
        'chat',
        {'message_id': instance.id, 'content': instance.content, 'snapshot': {'room': room.id if room else None}},
        actor=None,
    )


# File uploads
@receiver(post_save, sender=FileAsset)
def _timeline_file(sender, instance: FileAsset, created, **kwargs):
    if not created:
        return
    room = instance.room
    event_id = room.event_id if room else None
    _log(
        event_id,
        'file_uploaded',
        'files',
        {
            'file_id': instance.id,
            'name': instance.file.name,
            'size': instance.size,
            'snapshot': {'room': room.id if room else None, 'size': instance.size},
        },
        actor=instance.uploaded_by,
    )


# Poster lock/edit
@receiver(pre_save, sender=PosterDraft)
def _store_old_lock(sender, instance: PosterDraft, **kwargs):
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._old_locked_by = old.locked_by_id
        except sender.DoesNotExist:
            instance._old_locked_by = None


@receiver(post_save, sender=PosterDraft)
def _timeline_poster(sender, instance: PosterDraft, created, **kwargs):
    event_id = instance.event_id
    old_lock = getattr(instance, '_old_locked_by', None)
    if created:
        _log(
            event_id,
            'poster_edit',
            'poster',
            {'poster_id': instance.id, 'name': instance.name, 'locked_by': instance.locked_by_id, 'snapshot': _snapshot(instance, ['locked_by_id'])},
            actor=instance.owner,
        )
    else:
        if old_lock != instance.locked_by_id:
            action = 'lock' if instance.locked_by_id else 'unlock'
            _log(
                event_id,
                'poster_edit',
                'poster',
                {
                    'poster_id': instance.id,
                    'action': action,
                    'locked_by': instance.locked_by_id,
                    'snapshot': _snapshot(instance, ['locked_by_id']),
                },
                actor=instance.locked_by,
            )
        else:
            _log(event_id, 'poster_edit', 'poster', {'poster_id': instance.id, 'name': instance.name, 'snapshot': _snapshot(instance, ['locked_by_id'])}, actor=instance.owner)


# Certificate generation
@receiver(post_save, sender=CertificateRecord)
def _timeline_certificate(sender, instance: CertificateRecord, created, **kwargs):
    if not created:
        return
    _log(
        instance.event_id,
        'certificate_generated',
        'certificate',
        {'certificate_id': instance.id, 'name': instance.name, 'user': instance.user_id, 'snapshot': {'user': instance.user_id}},
        actor=instance.user,
    )


# Event participants join/leave
@receiver(m2m_changed, sender=Event.participants.through)
def _timeline_participants(sender, instance: Event, action, pk_set, **kwargs):
    if action not in ('post_add', 'post_remove'):
        return
    type_ = 'user_joined' if action == 'post_add' else 'user_left'
    for user_id in pk_set:
        _log(instance.id, type_, 'participants', {'user': user_id, 'snapshot': {'user': user_id}}, actor=None)
