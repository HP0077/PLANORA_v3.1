"""Prompt builder for event-scoped AI assistant."""
from __future__ import annotations

import html
import re
from typing import Dict, List, Tuple
from django.utils import timezone
from django.db import DatabaseError
from django.db.models import Count, Max, Q
from apps.events.models import Event
from apps.event_intelligence.models import EventProfile
from apps.tasks_app.models import Task
from apps.budget.models import BudgetHealth
from apps.poster.models import CertificateBatch, CertificateRecord
from apps.timeline.models import TimelineEntry
from apps.automation.models import AutomationLog

QUESTION_MAX_CHARS = 500
CONTEXT_MAX_CHARS = 4000  # tighter bound to keep local generations fast
TIMELINE_LIMIT = 10
AUTOMATION_LIMIT = 10


def _sanitize_question(q: str) -> str:
    text = (q or '')[:QUESTION_MAX_CHARS]
    text = html.unescape(text)
    text = re.sub(r'<[^>]+>', '', text)
    return text.strip()


def _summarize_timeline(entries: List[TimelineEntry]) -> List[Dict]:
    summary = []
    for e in entries:
        summary.append({
            'type': e.type,
            'source': e.source,
            'created_at': e.created_at.isoformat(),
            'actor': getattr(e.actor, 'username', None) or 'SYSTEM',
        })
    return summary


def _summarize_automation(logs: List[AutomationLog]) -> List[Dict]:
    return [
        {
            'trigger': log.trigger,
            'created_at': log.created_at.isoformat(),
        }
        for log in logs
    ]


def _overdue_tasks(event_id: int) -> Tuple[int, List[str]]:
    today = timezone.localdate()
    qs = Task.objects.filter(event_id=event_id)
    overdue_qs = qs.filter(Q(due_date__lt=today) & Q(status__in=['pending', 'in_progress']))
    count = overdue_qs.count()
    top_titles = list(overdue_qs.order_by('due_date').values_list('title', flat=True)[:5])
    return count, top_titles


def _task_counts(event_id: int) -> Dict[str, int]:
    rows = Task.objects.filter(event_id=event_id).values('status').annotate(c=Count('id'))
    out = {'pending': 0, 'in_progress': 0, 'done': 0}
    for row in rows:
        out[row['status']] = row['c']
    out['total'] = sum(out.values())
    return out


def _certificate_stats(event_id: int) -> Dict[str, int]:
    try:
        batches = CertificateBatch.objects.filter(event_id=event_id).values('status').annotate(c=Count('id'))
        stats = {row['status']: row['c'] for row in batches}
        stats['issued'] = CertificateRecord.objects.filter(event_id=event_id).count()
        return stats
    except DatabaseError:
        # Keep prompt building resilient when optional poster tables are absent in certain test setups.
        return {'issued': 0}


def build_prompt(user, event_id: int, question: str) -> Dict[str, str]:
    """Build a safe, bounded prompt using authorized event context."""
    sanitized_question = _sanitize_question(question)
    try:
        event = Event.objects.select_related('owner').prefetch_related('participants').get(id=event_id)
    except Event.DoesNotExist:
        raise ValueError('Event not found')

    if not (event.owner_id == user.id or event.participants.filter(id=user.id).exists()):
        raise PermissionError('Not allowed for this event')

    profile = EventProfile.objects.filter(event_id=event_id).first()
    budget = BudgetHealth.objects.filter(event_id=event_id).first()
    task_counts = _task_counts(event_id)
    overdue_count, overdue_titles = _overdue_tasks(event_id)
    cert_stats = _certificate_stats(event_id)

    timeline_entries = list(
        TimelineEntry.objects.filter(event_id=event_id)
        .select_related('actor')
        .order_by('-created_at')[:TIMELINE_LIMIT]
    )
    automation_logs = list(
        AutomationLog.objects.filter(Q(payload__event_id=event_id) | Q(payload__event=event_id))
        .order_by('-created_at')[:AUTOMATION_LIMIT]
    )

    timeline_summary = _summarize_timeline(timeline_entries)
    automation_summary = _summarize_automation(automation_logs)

    participants_count = event.participants.count()
    event_summary = (
        f"Event: {event.name}\n"
        f"Status: {event.status}\n"
        f"Mode: {event.mode}\n"
        f"Date: {event.date} {event.time}\n"
        f"Participants: {participants_count}\n"
    )
    risk_section = ''
    if profile:
        risk_section = (
            f"Risk score: {profile.risk_score}\n"
            f"Readiness: {profile.readiness_score}\n"
            f"Engagement: {profile.engagement_score}\n"
            f"Overdue tasks (profile): {profile.overdue_tasks}\n"
            f"Budget variance (profile): {profile.budget_variance}\n"
            f"Inactivity days: {profile.inactivity_days}\n"
        )

    budget_section = ''
    if budget:
        budget_section = (
            f"Budget status: {budget.status}\n"
            f"Total estimated: {budget.total_estimated}\n"
            f"Total actual: {budget.total_actual}\n"
            f"Variance: {budget.variance}\n"
        )

    tasks_section = (
        f"Tasks total: {task_counts.get('total', 0)}\n"
        f"Pending: {task_counts.get('pending', 0)}\n"
        f"In progress: {task_counts.get('in_progress', 0)}\n"
        f"Done: {task_counts.get('done', 0)}\n"
        f"Overdue count: {overdue_count}\n"
        f"Top overdue: {', '.join(overdue_titles) if overdue_titles else 'None'}\n"
    )

    cert_section = (
        f"Certificate batches: {cert_stats}\n"
    )

    timeline_section = f"Recent timeline (last {TIMELINE_LIMIT}): {timeline_summary}\n"
    automation_section = f"Automation triggers (last {AUTOMATION_LIMIT}): {automation_summary}\n"

    system_instructions = (
        "You are Planora's event AI assistant. \n"
        "- Use a smart, motivating tone.\n"
        "- Never invent data.\n"
        "- Only use the provided context.\n"
        "- Do not expose secrets, file paths, URLs, or automation rule internals.\n"
        "- Suggest non-destructive next steps.\n"
    )

    prompt = (
        f"{system_instructions}\n\n"
        f"Context:\n{event_summary}\n{risk_section}{tasks_section}{budget_section}{cert_section}{timeline_section}{automation_section}\n"
        f"Question: {sanitized_question}\n"
        "Answer with: a concise answer plus a short bullet list of suggested next steps (non-destructive)."
    )

    if len(prompt) > CONTEXT_MAX_CHARS:
        prompt = prompt[:CONTEXT_MAX_CHARS]

    return {
        'prompt': prompt,
        'question': sanitized_question,
    }
