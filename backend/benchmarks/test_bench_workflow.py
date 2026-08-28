"""End-to-end workflow timing benchmark.

Measures the complete event setup workflow using the REST API:
event creation → AI description (mocked) → task creation → budget entry →
intelligence computation → automation evaluation.

This provides the legitimate measured timing data that replaces the
fabricated estimates in the original paper.
"""
import json
import os
import statistics
import time
from unittest import mock

import pytest
from django.test import override_settings

from apps.budget.services import recalc_budget_health
from apps.event_intelligence.services import compute_event_profile
from apps.automation.utils import run_automation
from apps.events.models import Event

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


from django.conf import settings
from django.core.cache import cache

@pytest.mark.django_db
@mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('A compelling event description.', 20))
def test_full_workflow_timing(mock_gen, auth_client, bench_user):
    """Measure end-to-end workflow timing over 10 iterations."""
    iterations = 10
    all_runs = []
    cache.clear()

    unthrottled_rf = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_CLASSES': (),
        'DEFAULT_THROTTLE_RATES': {},
    }

    with override_settings(AI_PROVIDER='ollama', REST_FRAMEWORK=unthrottled_rf):
        for i in range(iterations):
            step_times = {}

            # Step 1: Create event via API
            t0 = time.perf_counter()
            resp = auth_client.post('/api/events/', {
                'name': f'Workflow Event {i}',
                'description': '',
                'date': '2030-06-15',
                'time': '14:00',
                'mode': 'offline',
                'status': 'PLANNING',
            }, format='json')
            step_times['event_creation_ms'] = (time.perf_counter() - t0) * 1000
            assert resp.status_code == 201, f"Event creation failed: {resp.json()}"
            event_id = resp.json()['id']
            event = Event.objects.get(id=event_id)
            event.participants.add(bench_user)

            # Step 2: Generate AI description (mocked LLM)
            t0 = time.perf_counter()
            resp = auth_client.post('/api/ai/generate-description/', {
                'event_name': f'Workflow Event {i}',
                'event_type': 'conference',
                'audience': 'developers',
                'keywords': 'AI, technology',
                'tone': 'professional',
            }, format='json')
            step_times['ai_description_ms'] = (time.perf_counter() - t0) * 1000

            # Step 3: Create 10 tasks via API
            t0 = time.perf_counter()
            for j in range(10):
                auth_client.post('/api/tasks/', {
                    'title': f'Task {j}',
                    'event': event_id,
                    'status': 'pending',
                    'priority': ['low', 'medium', 'high'][j % 3],
                }, format='json')
            step_times['task_creation_10_ms'] = (time.perf_counter() - t0) * 1000

            # Step 4: Create 5 budget items via API
            t0 = time.perf_counter()
            for j in range(5):
                auth_client.post('/api/budget/', {
                    'event': event_id,
                    'type': 'expense',
                    'title': f'Expense {j}',
                    'estimated': 500 + j * 100,
                    'actual': 400 + j * 80,
                }, format='json')
            step_times['budget_creation_5_ms'] = (time.perf_counter() - t0) * 1000

            # Step 5: Compute intelligence profile
            t0 = time.perf_counter()
            recalc_budget_health(event_id)
            profile = compute_event_profile(event)
            step_times['intelligence_compute_ms'] = (time.perf_counter() - t0) * 1000

            # Step 6: Trigger automation evaluation
            t0 = time.perf_counter()
            run_automation('event_updated', {'event': event_id})
            step_times['automation_eval_ms'] = (time.perf_counter() - t0) * 1000

            step_times['total_ms'] = sum(step_times.values())
            all_runs.append(step_times)

    # Compute aggregate statistics
    totals = [r['total_ms'] for r in all_runs]
    step_names = ['event_creation_ms', 'ai_description_ms', 'task_creation_10_ms',
                  'budget_creation_5_ms', 'intelligence_compute_ms', 'automation_eval_ms', 'total_ms']

    aggregate = {}
    for step in step_names:
        values = [r[step] for r in all_runs]
        aggregate[step] = {
            'mean': round(statistics.mean(values), 2),
            'median': round(statistics.median(values), 2),
            'std_dev': round(statistics.stdev(values), 2) if len(values) > 1 else 0,
            'min': round(min(values), 2),
            'max': round(max(values), 2),
        }

    results = {
        'iterations': iterations,
        'per_run': all_runs,
        'aggregate': aggregate,
    }

    output_path = os.path.join(RESULTS_DIR, 'workflow_timing.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
