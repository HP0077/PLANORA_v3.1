from __future__ import annotations

from typing import Any, Dict, Iterable, Optional
from django.db.models import Count, Max, Sum, Q, IntegerField, Case, When
from django.utils import timezone

from apps.events.models import Event
from apps.event_intelligence.models import EventProfile
from apps.tasks_app.models import Task
from apps.budget.models import BudgetHealth
from apps.automation.models import AutomationLog
from .models import Rule
from .actions import dispatch_actions


OPERATORS = {
    '>': lambda a, b: a > b,
    '>=': lambda a, b: a >= b,
    '<': lambda a, b: a < b,
    '<=': lambda a, b: a <= b,
    '==': lambda a, b: a == b,
    '!=': lambda a, b: a != b,
    'in': lambda a, b: a in b if b is not None else False,
}


def _load_context(event_id: Optional[int]) -> Dict[str, Any]:
    ctx: Dict[str, Any] = {}
    if not event_id:
        return ctx

    event = Event.objects.select_related('owner').filter(id=event_id).first()
    profile = EventProfile.objects.filter(event_id=event_id).first()
    budget = BudgetHealth.objects.filter(event_id=event_id).first()

    task_stats = Task.objects.filter(event_id=event_id).aggregate(
        total=Count('id'),
        overdue=Sum(
            Case(
                When(Q(due_date__lt=timezone.localdate()) & Q(status__in=['pending', 'in_progress']), then=1),
                default=0,
                output_field=IntegerField(),
            )
        ),
        latest=Max('created_at')
    )

    ctx['event'] = event
    ctx['profile'] = profile
    ctx['budget'] = budget
    ctx['task_stats'] = task_stats
    ctx['payload'] = {}
    return ctx


def _value_for(key: str, ctx: Dict[str, Any], payload: Dict[str, Any]):
    event = ctx.get('event')
    profile = ctx.get('profile')
    budget = ctx.get('budget')
    task_stats = ctx.get('task_stats') or {}

    mapping = {
        'risk_score': getattr(profile, 'risk_score', None) if profile else payload.get('risk'),
        'readiness_score': getattr(profile, 'readiness_score', None) if profile else None,
        'engagement_score': getattr(profile, 'engagement_score', None) if profile else None,
        'overdue_tasks': getattr(profile, 'overdue_tasks', None) if profile else task_stats.get('overdue'),
        'budget_variance': getattr(profile, 'budget_variance', None) if profile else getattr(budget, 'variance', None),
        'inactivity_days': getattr(profile, 'inactivity_days', None),
        'event_status': getattr(event, 'status', None),
        'task_overdue_count': task_stats.get('overdue'),
        'task_total': task_stats.get('total'),
        'missing_meeting': getattr(profile, 'missing_meeting', None) if profile else None,
    }
    return mapping.get(key)


def _match_conditions(conditions: Dict[str, Any], ctx: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    if not conditions:
        return True
    for key, rule in conditions.items():
        val = _value_for(key, ctx, payload)
        if val is None:
            return False
        if isinstance(rule, dict):
            for op, target in rule.items():
                fn = OPERATORS.get(op)
                if not fn or not fn(val, target):
                    return False
        else:
            # direct equality check
            if val != rule:
                return False
    return True


def evaluate_rules(trigger: str, payload: Optional[Dict[str, Any]] = None) -> None:
    payload = payload or {}
    event_id = payload.get('event') or payload.get('event_id')

    qs = Rule.objects.filter(trigger=trigger, is_active=True)
    if event_id:
        qs = qs.filter(Q(event__isnull=True) | Q(event_id=event_id))
    else:
        qs = qs.filter(event__isnull=True)

    rules = list(qs.select_related('event', 'created_by'))
    if not rules:
        return

    ctx = _load_context(event_id)
    ctx['payload'] = payload
    confirmed = bool(payload.get('confirm'))

    for rule in rules:
        if rule.event_id and rule.event_id != event_id:
            continue
        if not _match_conditions(rule.conditions or {}, ctx, payload):
            continue
        dispatch_actions(
            event_id,
            rule.actions or [],
            requires_confirmation=rule.requires_confirmation,
            confirmed=confirmed,
        )
        AutomationLog.objects.create(trigger=f'rule_match:{rule.id}', payload={'trigger': trigger, 'rule': rule.id, 'event': event_id, 'payload': payload, 'confirmed': confirmed})
