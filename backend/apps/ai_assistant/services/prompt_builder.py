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


# ---------------------------------------------------------------------------
# Tier 1 GenAI prompt builders
# ---------------------------------------------------------------------------

def build_description_prompt(event_name: str, event_type: str, audience: str,
                              keywords: str, tone: str) -> str:
    """Build a prompt that generates a polished event description."""
    prompt = (
        "You are Planora's event copywriter AI.\n"
        "Write a compelling event description (120-200 words) based on the details below.\n"
        f"- Tone: {tone}\n"
        "- Do NOT invent dates, prices, or speaker names unless explicitly provided.\n"
        "- Return ONLY the description text, no headings or labels.\n\n"
        f"Event name: {event_name}\n"
    )
    if event_type:
        prompt += f"Event type: {event_type}\n"
    if audience:
        prompt += f"Target audience: {audience}\n"
    if keywords:
        prompt += f"Keywords / highlights: {keywords}\n"
    prompt += "\nDescription:"
    return prompt[:CONTEXT_MAX_CHARS]


def build_task_suggestions_prompt(user, event_id: int, additional_context: str = '') -> str:
    """Build a prompt that suggests tasks for an event."""
    try:
        event = Event.objects.select_related('owner').prefetch_related('participants').get(id=event_id)
    except Event.DoesNotExist:
        raise ValueError('Event not found')

    if not (event.owner_id == user.id or event.participants.filter(id=user.id).exists()):
        raise PermissionError('Not allowed for this event')

    task_counts = _task_counts(event_id)
    existing_titles = list(
        Task.objects.filter(event_id=event_id)
        .values_list('title', flat=True)[:20]
    )

    prompt = (
        "You are Planora's event planning AI.\n"
        "Suggest 5-8 actionable tasks for this event. For each task provide:\n"
        "- Title (short)\n"
        "- Priority: low / medium / high\n"
        "- Suggested days-before-event to set as deadline\n"
        "- One-sentence description\n\n"
        "Format each task as:\n"
        "TASK: <title> | PRIORITY: <priority> | DAYS_BEFORE: <number> | DESC: <description>\n\n"
        "Do NOT duplicate existing tasks. Do NOT invent participant names.\n\n"
        f"Event: {event.name}\n"
        f"Status: {event.status}\n"
        f"Mode: {event.mode}\n"
        f"Date: {event.date}\n"
        f"Current task stats: {task_counts}\n"
        f"Existing tasks: {', '.join(existing_titles) if existing_titles else 'None yet'}\n"
    )
    if additional_context:
        prompt += f"Additional context: {additional_context}\n"
    prompt += "\nSuggested tasks:"
    return prompt[:CONTEXT_MAX_CHARS]


def build_event_summary_prompt(user, event_id: int, fmt: str = 'brief') -> str:
    """Build a prompt that generates a status summary / report for an event."""
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
    participants_count = event.participants.count()

    length_guide = "150-250 words" if fmt == 'detailed' else "80-120 words"

    context = (
        f"Event: {event.name}\n"
        f"Status: {event.status}\n"
        f"Mode: {event.mode}\n"
        f"Date: {event.date} {event.time}\n"
        f"Participants: {participants_count}\n"
    )
    if profile:
        context += (
            f"Risk score: {profile.risk_score}\n"
            f"Readiness: {profile.readiness_score}\n"
            f"Engagement: {profile.engagement_score}\n"
        )
    context += (
        f"Tasks — total: {task_counts.get('total', 0)}, pending: {task_counts.get('pending', 0)}, "
        f"in_progress: {task_counts.get('in_progress', 0)}, done: {task_counts.get('done', 0)}\n"
        f"Overdue: {overdue_count} ({', '.join(overdue_titles) if overdue_titles else 'none'})\n"
    )
    if budget:
        context += (
            f"Budget — estimated: {budget.total_estimated}, actual: {budget.total_actual}, "
            f"variance: {budget.variance}, status: {budget.status}\n"
        )
    context += f"Certificates: {cert_stats}\n"

    prompt = (
        "You are Planora's event reporting AI.\n"
        f"Write a {fmt} status report ({length_guide}) for this event.\n"
        "Structure: opening summary sentence, then sections for Tasks, Budget, Risk, and a closing recommendation.\n"
        "Use bullet points for key metrics. Do NOT invent data.\n\n"
        f"{context}\n"
        "Report:"
    )
    return prompt[:CONTEXT_MAX_CHARS]


def build_risk_mitigation_prompt(user, event_id: int) -> str:
    """Build a prompt that suggests risk mitigation actions based on event profile."""
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

    risk_data = "No intelligence profile computed yet."
    if profile:
        risk_data = (
            f"Risk score: {profile.risk_score:.2f} (0=safe, 1=critical)\n"
            f"Readiness: {profile.readiness_score:.2f}\n"
            f"Overdue tasks: {profile.overdue_tasks}\n"
            f"Budget variance: {profile.budget_variance}\n"
            f"Inactivity days: {profile.inactivity_days}\n"
            f"Missing meeting link: {profile.missing_meeting}\n"
        )

    budget_data = "No budget data."
    if budget:
        budget_data = (
            f"Budget status: {budget.status}, estimated: {budget.total_estimated}, "
            f"actual: {budget.total_actual}, variance: {budget.variance}\n"
        )

    prompt = (
        "You are Planora's risk mitigation AI advisor.\n"
        "Analyze the risk profile below and provide:\n"
        "1. A one-sentence risk assessment\n"
        "2. A numbered list of 3-5 specific, actionable mitigation steps\n"
        "3. For each step, explain WHY it helps reduce risk\n\n"
        "Be specific and reference the actual data. Do NOT invent data.\n\n"
        f"Event: {event.name}\n"
        f"Status: {event.status}\n"
        f"Mode: {event.mode}\n"
        f"Date: {event.date}\n"
        f"{risk_data}\n"
        f"Task stats: total={task_counts.get('total', 0)}, pending={task_counts.get('pending', 0)}, "
        f"overdue={overdue_count}\n"
        f"Top overdue tasks: {', '.join(overdue_titles) if overdue_titles else 'None'}\n"
        f"{budget_data}\n"
        "Risk mitigation plan:"
    )
    return prompt[:CONTEXT_MAX_CHARS]


def build_draft_email_prompt(user, event_id: int, template_type: str,
                              recipient_name: str = '', additional_notes: str = '',
                              tone: str = 'professional') -> str:
    """Build a prompt that drafts an email/invitation for an event."""
    try:
        event = Event.objects.select_related('owner').prefetch_related('participants').get(id=event_id)
    except Event.DoesNotExist:
        raise ValueError('Event not found')

    if not (event.owner_id == user.id or event.participants.filter(id=user.id).exists()):
        raise PermissionError('Not allowed for this event')

    participants_count = event.participants.count()

    template_instructions = {
        'invitation': (
            "Write an event invitation email that:\n"
            "- Opens with an engaging hook\n"
            "- Clearly states the event name, date, time, and mode\n"
            "- Highlights why they should attend\n"
            "- Includes a clear call-to-action (RSVP / register)\n"
            "- Closes warmly\n"
        ),
        'reminder': (
            "Write a friendly reminder email that:\n"
            "- Reminds them the event is coming up soon\n"
            "- Restates the event name, date, time, and mode\n"
            "- Mentions any preparation needed\n"
            "- Creates a sense of excitement\n"
        ),
        'thank_you': (
            "Write a post-event thank you email that:\n"
            "- Thanks them for attending/participating\n"
            "- Highlights key moments or achievements\n"
            "- Mentions next steps or upcoming events if applicable\n"
            "- Asks for feedback\n"
        ),
        'follow_up': (
            "Write a follow-up email that:\n"
            "- References the event they attended\n"
            "- Shares any resources or materials discussed\n"
            "- Proposes next steps or action items\n"
            "- Encourages continued engagement\n"
        ),
        'cancellation': (
            "Write an event cancellation email that:\n"
            "- Clearly states the event is cancelled\n"
            "- Provides a brief, honest reason (keep it professional)\n"
            "- Apologizes for the inconvenience\n"
            "- Mentions rescheduling plans if applicable\n"
            "- Offers contact info for questions\n"
        ),
        'update': (
            "Write an event update email that:\n"
            "- Clearly states what has changed (date, time, venue, format, etc.)\n"
            "- Restates the updated event details\n"
            "- Explains why the change was made (briefly)\n"
            "- Reassures attendees and maintains excitement\n"
        ),
    }

    instructions = template_instructions.get(template_type, template_instructions['invitation'])

    prompt = (
        "You are Planora's email copywriter AI.\n"
        f"Draft a {template_type.replace('_', ' ')} email for this event.\n"
        f"Tone: {tone}\n\n"
        f"{instructions}\n"
        "Format the output as:\n"
        "SUBJECT: <email subject line>\n"
        "---\n"
        "<email body>\n\n"
        "Rules:\n"
        "- Keep it 100-200 words\n"
        "- Do NOT invent details not provided (speaker names, prices, etc.)\n"
        "- Use the actual event details below\n"
        f"- If a meeting link exists, include it\n\n"
        f"Event: {event.name}\n"
        f"Date: {event.date}\n"
        f"Time: {event.time}\n"
        f"Mode: {event.mode}\n"
        f"Status: {event.status}\n"
        f"Current participants: {participants_count}\n"
    )
    if event.meeting_link:
        prompt += f"Meeting link: {event.meeting_link}\n"
    if event.description:
        prompt += f"Event description: {event.description[:200]}\n"
    if recipient_name:
        prompt += f"Recipient name: {recipient_name}\n"
    if additional_notes:
        prompt += f"Additional notes: {additional_notes}\n"

    prompt += "\nEmail:"
    return prompt[:CONTEXT_MAX_CHARS]
