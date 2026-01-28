"""Computation utilities for Event Intelligence Engine."""
from __future__ import annotations

import math
from datetime import timedelta
from typing import Iterable, Optional

from django.db import transaction
from django.db.models import Count, Max, Q, Sum, Case, When, IntegerField
from django.utils import timezone

from apps.automation.utils import run_automation
from apps.budget.models import BudgetHealth
from apps.chats.models import Message
from apps.files.models import FileAsset
from apps.tasks_app.models import Task
from apps.events.models import Event

from .models import EventProfile


def _latest_datetime(*values) -> Optional[timezone.datetime]:
    """Return the latest non-null datetime from provided values."""
    present = [v for v in values if v is not None]
    if not present:
        return None
    return max(present)


def compute_event_profile(event: Event) -> EventProfile:
    """Compute and persist intelligence metrics for a single event."""
    now = timezone.now()
    today = timezone.localdate()

    # Task signals
    task_qs = Task.objects.filter(event=event)
    total_tasks = task_qs.count()
    overdue_tasks = task_qs.filter(due_date__lt=today, status__in=['pending', 'in_progress']).count()

    # Budget signals
    bh = BudgetHealth.objects.filter(event=event).first()
    variance = float(bh.variance) if bh else 0.0
    total_estimated = float(bh.total_estimated) if bh else 1.0

    # Activity signals (latest among messages, files, tasks)
    latest_msg = Message.objects.filter(room__event=event).aggregate(Max('created_at'))['created_at__max']
    latest_file = FileAsset.objects.filter(room__event=event).aggregate(Max('created_at'))['created_at__max']
    latest_task = task_qs.aggregate(Max('created_at'))['created_at__max']

    latest_activity = _latest_datetime(latest_msg, latest_file, latest_task)
    if latest_activity:
        inactivity_days = max(0, (now - latest_activity).days)
    else:
        inactivity_days = 999  # no activity yet

    # Meeting signal
    missing_meeting = (event.mode == 'online') and not bool(event.meeting_link)

    # Engagement signals (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    chat_count = Message.objects.filter(room__event=event, created_at__gte=seven_days_ago).count()
    file_count = FileAsset.objects.filter(room__event=event, created_at__gte=seven_days_ago).count()
    participants = event.participants.count()
    engagement_score = math.log(chat_count + 1) + math.log(file_count + 1) + participants

    # Risk formula
    task_component = overdue_tasks / max(total_tasks, 1)
    budget_component = max(variance, 0) / max(total_estimated, 1)
    inactivity_component = min(inactivity_days, 30) / 30
    meeting_component = 1.0 if missing_meeting else 0.0

    raw_risk = (
        0.3 * task_component +
        0.3 * budget_component +
        0.2 * inactivity_component +
        0.2 * meeting_component
    )
    risk_score = max(0.0, min(1.0, raw_risk))
    readiness_score = 1.0 - risk_score

    with transaction.atomic():
        profile, _ = EventProfile.objects.update_or_create(
            event=event,
            defaults={
                'risk_score': risk_score,
                'readiness_score': readiness_score,
                'engagement_score': int(round(engagement_score)),
                'overdue_tasks': overdue_tasks,
                'budget_variance': variance,
                'inactivity_days': inactivity_days,
                'missing_meeting': missing_meeting,
            }
        )

    if risk_score > 0.7:
        run_automation('event_risk_high', {'event': event.id, 'risk': risk_score})

    return profile


def compute_event_profiles(events: Iterable[Event]) -> list[EventProfile]:
    """Bulk compute intelligence profiles for a set of events with minimal queries."""
    events = list(events)
    if not events:
        return []

    now = timezone.now()
    today = timezone.localdate()
    event_ids = [e.id for e in events]

    # Task aggregates
    task_agg = Task.objects.filter(event_id__in=event_ids).values('event_id').annotate(
        total=Count('id'),
        overdue=Sum(
            Case(
                When(Q(due_date__lt=today) & Q(status__in=['pending', 'in_progress']), then=1),
                default=0,
                output_field=IntegerField(),
            )
        ),
        latest=Max('created_at'),
    )
    task_map = {row['event_id']: row for row in task_agg}

    # Budget health map
    budget_map = {bh.event_id: bh for bh in BudgetHealth.objects.filter(event_id__in=event_ids)}

    # Activity (messages/files latest per event)
    msg_latest = {
        row['room__event_id']: row['latest']
        for row in Message.objects.filter(room__event_id__in=event_ids).values('room__event_id').annotate(latest=Max('created_at'))
    }
    file_latest = {
        row['room__event_id']: row['latest']
        for row in FileAsset.objects.filter(room__event_id__in=event_ids).values('room__event_id').annotate(latest=Max('created_at'))
    }

    # Engagement counts (last 7 days)
    seven_days_ago = now - timedelta(days=7)
    msg_counts = {
        row['room__event_id']: row['c']
        for row in Message.objects.filter(room__event_id__in=event_ids, created_at__gte=seven_days_ago).values('room__event_id').annotate(c=Count('id'))
    }
    file_counts = {
        row['room__event_id']: row['c']
        for row in FileAsset.objects.filter(room__event_id__in=event_ids, created_at__gte=seven_days_ago).values('room__event_id').annotate(c=Count('id'))
    }

    # Participant counts (M2M through table)
    through = events[0].participants.through
    participant_counts = {
        row['event_id']: row['c']
        for row in through.objects.filter(event_id__in=event_ids).values('event_id').annotate(c=Count('user_id', distinct=True))
    }

    profiles: list[EventProfile] = []
    for ev in events:
        t_row = task_map.get(ev.id, {'total': 0, 'overdue': 0, 'latest': None})
        total_tasks = t_row.get('total') or 0
        overdue_tasks = t_row.get('overdue') or 0

        bh = budget_map.get(ev.id)
        variance = float(bh.variance) if bh else 0.0
        total_estimated = float(bh.total_estimated) if bh else 1.0

        latest_activity = _latest_datetime(
            msg_latest.get(ev.id),
            file_latest.get(ev.id),
            t_row.get('latest'),
        )
        inactivity_days = max(0, (now - latest_activity).days) if latest_activity else 999

        missing_meeting = (ev.mode == 'online') and not bool(ev.meeting_link)

        chat_count = msg_counts.get(ev.id, 0)
        file_count = file_counts.get(ev.id, 0)
        participants = participant_counts.get(ev.id, 0)
        engagement_score = math.log(chat_count + 1) + math.log(file_count + 1) + participants

        task_component = overdue_tasks / max(total_tasks, 1)
        budget_component = max(variance, 0) / max(total_estimated, 1)
        inactivity_component = min(inactivity_days, 30) / 30
        meeting_component = 1.0 if missing_meeting else 0.0

        raw_risk = (
            0.3 * task_component +
            0.3 * budget_component +
            0.2 * inactivity_component +
            0.2 * meeting_component
        )
        risk_score = max(0.0, min(1.0, raw_risk))
        readiness_score = 1.0 - risk_score

        with transaction.atomic():
            profile, _ = EventProfile.objects.update_or_create(
                event=ev,
                defaults={
                    'risk_score': risk_score,
                    'readiness_score': readiness_score,
                    'engagement_score': int(round(engagement_score)),
                    'overdue_tasks': overdue_tasks,
                    'budget_variance': variance,
                    'inactivity_days': inactivity_days,
                    'missing_meeting': missing_meeting,
                }
            )
        if risk_score > 0.7:
            run_automation('event_risk_high', {'event': ev.id, 'risk': risk_score})
        profiles.append(profile)

    return profiles
