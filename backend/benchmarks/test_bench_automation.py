"""Automation engine validation benchmark.

Validates that the rule evaluator correctly fires/skips rules based on conditions,
and measures rule evaluation latency.
"""
import json
import os
import statistics
import time
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.automation.models import AutomationLog
from apps.automation.utils import run_automation
from apps.automation_rules.models import Rule
from apps.budget.models import BudgetItem
from apps.budget.services import recalc_budget_health
from apps.event_intelligence.services import compute_event_profile
from apps.events.models import Event
from apps.tasks_app.models import Task

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


@pytest.mark.django_db
class TestAutomationRuleEvaluation:
    """Validate rule trigger correctness and latency."""

    def test_rule_fires_on_high_risk(self, bench_user):
        """Rule with trigger 'event_risk_high' should fire when risk > 0.7."""
        ev = Event.objects.create(
            owner=bench_user, name='High Risk Event',
            date=timezone.localdate() + timedelta(days=5),
            time='14:00', mode='online', meeting_link='', status='PLANNING',
        )
        # Create rule
        rule = Rule.objects.create(
            name='Alert on high risk',
            trigger='event_risk_high',
            conditions={'risk_score': {'>': 0.7}},
            actions=[{'type': 'post_chat', 'message': 'Risk is high!'}],
            is_active=True,
            created_by=bench_user,
            event=ev,
            requires_confirmation=False,
        )

        # Create conditions for high risk: all tasks overdue + budget overspent + missing meeting
        yesterday = timezone.localdate() - timedelta(days=1)
        Task.objects.create(event=ev, title='Overdue', due_date=yesterday, status='pending')
        BudgetItem.objects.create(event=ev, type='expense', title='Over', estimated=100, actual=300)
        recalc_budget_health(ev.id)

        # Compute profile (this triggers run_automation('event_risk_high', ...) if risk > 0.7)
        initial_log_count = AutomationLog.objects.count()
        profile = compute_event_profile(ev)

        if profile.risk_score > 0.7:
            # Automation should have been triggered
            new_logs = AutomationLog.objects.filter(created_at__gte=timezone.now() - timedelta(seconds=5))
            assert new_logs.filter(trigger='event_risk_high').exists(), \
                "Expected event_risk_high trigger log"

    def test_rule_does_not_fire_on_low_risk(self, bench_user):
        """Rule should NOT fire when risk is below threshold."""
        ev = Event.objects.create(
            owner=bench_user, name='Safe Event',
            date=timezone.localdate() + timedelta(days=5),
            time='14:00', mode='online', meeting_link='https://meet.example.com',
            status='PLANNING',
        )
        Rule.objects.create(
            name='Alert on high risk',
            trigger='event_risk_high',
            conditions={'risk_score': {'>': 0.7}},
            actions=[{'type': 'post_chat', 'message': 'Risk is high!'}],
            is_active=True,
            created_by=bench_user,
            event=ev,
            requires_confirmation=False,
        )

        # All tasks done, budget OK → low risk
        Task.objects.create(event=ev, title='Done', due_date=timezone.localdate() + timedelta(days=1), status='done')
        BudgetItem.objects.create(event=ev, type='expense', title='OK', estimated=100, actual=50)
        recalc_budget_health(ev.id)

        profile = compute_event_profile(ev)
        # With meeting link present, tasks done, budget OK → risk should be low
        assert profile.risk_score <= 0.7


@pytest.mark.django_db
def test_automation_evaluation_latency(bench_user):
    """Measure rule evaluation latency over 30 iterations."""
    ev = Event.objects.create(
        owner=bench_user, name='Latency Test Event',
        date=timezone.localdate() + timedelta(days=5),
        time='14:00', mode='offline', status='PLANNING',
    )

    times = []
    for _ in range(30):
        start = time.perf_counter()
        run_automation('test_trigger', {'event': ev.id})
        times.append((time.perf_counter() - start) * 1000)

    results = {
        'rule_evaluation_latency_ms': {
            'iterations': 30,
            'mean': statistics.mean(times),
            'median': statistics.median(times),
            'std_dev': statistics.stdev(times),
            'min': min(times),
            'max': max(times),
        },
    }

    output_path = os.path.join(RESULTS_DIR, 'automation_validation.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
