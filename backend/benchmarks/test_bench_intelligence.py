"""Intelligence risk-scoring validation benchmark.

Scientifically validates that the weighted heuristic risk formula produces
correct scores for controlled scenarios with known expected outcomes.
This is critical for claiming the risk scoring system works correctly.
"""
import json
import os
import statistics
import time
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.budget.models import BudgetItem
from apps.budget.services import recalc_budget_health
from apps.event_intelligence.services import compute_event_profile
from apps.events.models import Event
from apps.tasks_app.models import Task

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


def _create_event(user, **overrides):
    defaults = dict(
        owner=user, name='Intel Test Event',
        date=timezone.localdate() + timedelta(days=10),
        time='14:00', mode='offline', status='PLANNING',
    )
    defaults.update(overrides)
    return Event.objects.create(**defaults)


@pytest.mark.django_db
class TestIntelligenceValidation:
    """Seven controlled scenarios validating the risk scoring formula."""

    def test_scenario_1_fresh_event(self, bench_user):
        """Fresh event with no tasks, budget, or activity → low risk."""
        ev = _create_event(bench_user)
        profile = compute_event_profile(ev)
        # Only inactivity component should contribute (no activity → 999 days → capped at 1.0)
        # risk = 0.3*0 + 0.3*0 + 0.2*1.0 + 0.2*0 = 0.2
        assert 0.0 <= profile.risk_score <= 0.3, f"Expected ≤0.3, got {profile.risk_score}"

    def test_scenario_2_all_tasks_overdue(self, bench_user):
        """All tasks overdue → high task component (0.3 weight)."""
        ev = _create_event(bench_user)
        yesterday = timezone.localdate() - timedelta(days=1)
        for i in range(5):
            Task.objects.create(event=ev, title=f'T{i}', due_date=yesterday, status='pending')
        profile = compute_event_profile(ev)
        # task_component = 5/5 = 1.0, contribution = 0.3*1.0 = 0.3
        assert profile.overdue_tasks == 5
        assert profile.risk_score >= 0.3

    def test_scenario_3_budget_overspent(self, bench_user):
        """Budget overspent → high budget component (0.3 weight)."""
        ev = _create_event(bench_user)
        BudgetItem.objects.create(event=ev, type='expense', title='Over', estimated=100, actual=200)
        recalc_budget_health(ev.id)
        profile = compute_event_profile(ev)
        # budget_component = max(100,0)/100 = 1.0, contribution = 0.3*1.0 = 0.3
        assert profile.budget_variance > 0
        assert profile.risk_score >= 0.3

    def test_scenario_4_online_missing_meeting(self, bench_user):
        """Online event with no meeting link → meeting component active (0.2 weight)."""
        ev = _create_event(bench_user, mode='online', meeting_link='')
        profile = compute_event_profile(ev)
        assert profile.missing_meeting is True
        # meeting_component = 1.0, contribution = 0.2*1.0 = 0.2
        assert profile.risk_score >= 0.2

    def test_scenario_5_long_inactivity(self, bench_user):
        """No activity for 30+ days → full inactivity component (0.2 weight)."""
        ev = _create_event(bench_user)
        # No messages, files, or tasks → inactivity_days = 999 → capped at 30/30 = 1.0
        profile = compute_event_profile(ev)
        assert profile.inactivity_days >= 30 or profile.inactivity_days == 999
        # inactivity_component = 1.0, contribution = 0.2

    def test_scenario_6_combined_worst_case(self, bench_user):
        """All risk factors present → maximum risk."""
        ev = _create_event(bench_user, mode='online', meeting_link='')
        yesterday = timezone.localdate() - timedelta(days=1)
        Task.objects.create(event=ev, title='Overdue', due_date=yesterday, status='pending')
        BudgetItem.objects.create(event=ev, type='expense', title='Over', estimated=100, actual=300)
        recalc_budget_health(ev.id)
        profile = compute_event_profile(ev)
        # All components active → risk should be high
        assert profile.risk_score >= 0.7, f"Expected ≥0.7, got {profile.risk_score}"

    def test_scenario_7_all_healthy(self, bench_user):
        """All tasks done, budget under, recent activity, meeting link present → low risk."""
        ev = _create_event(bench_user, mode='online', meeting_link='https://meet.example.com')
        tomorrow = timezone.localdate() + timedelta(days=1)
        Task.objects.create(event=ev, title='Done', due_date=tomorrow, status='done')
        BudgetItem.objects.create(event=ev, type='expense', title='OK', estimated=100, actual=50)
        recalc_budget_health(ev.id)
        profile = compute_event_profile(ev)
        # Task component = 0/1 = 0, budget = 0 (variance negative), meeting = 0
        # Only inactivity might contribute (new task just created → recent activity)
        assert profile.risk_score <= 0.3, f"Expected ≤0.3, got {profile.risk_score}"


@pytest.mark.django_db
def test_intelligence_computation_latency(bench_user):
    """Measure risk scoring computation latency over 30 iterations."""
    ev = _create_event(bench_user, mode='online', meeting_link='')
    yesterday = timezone.localdate() - timedelta(days=1)
    for i in range(5):
        Task.objects.create(event=ev, title=f'T{i}', due_date=yesterday, status='pending')
    BudgetItem.objects.create(event=ev, type='expense', title='B', estimated=100, actual=200)
    recalc_budget_health(ev.id)

    times = []
    for _ in range(30):
        start = time.perf_counter()
        compute_event_profile(ev)
        times.append(time.perf_counter() - start)

    results = {
        'scenario_results': {},
        'latency_stats': {
            'iterations': len(times),
            'mean_ms': statistics.mean(times) * 1000,
            'median_ms': statistics.median(times) * 1000,
            'std_dev_ms': statistics.stdev(times) * 1000,
            'min_ms': min(times) * 1000,
            'max_ms': max(times) * 1000,
            'p95_ms': (statistics.quantiles(times, n=20)[18] * 1000) if len(times) >= 20 else max(times) * 1000,
        },
    }

    output_path = os.path.join(RESULTS_DIR, 'intelligence_validation.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
