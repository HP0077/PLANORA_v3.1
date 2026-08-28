"""API Latency Benchmark.

Measures CRUD latency across core REST endpoints using the Django test client.
Reports mean, median, SD, p95, and 95% confidence intervals.
"""
import json
import math
import os
import statistics
import time
from datetime import timedelta

import pytest
from django.utils import timezone

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


def record_stats(name, times, results):
    if not times:
        return
    times_ms = [t * 1000 for t in times]
    n = len(times_ms)
    mean = statistics.mean(times_ms)
    sd = statistics.stdev(times_ms) if n > 1 else 0.0
    ci_95 = 1.96 * (sd / math.sqrt(n)) if n > 1 else 0.0
    sorted_ms = sorted(times_ms)
    results[name] = {
        'n': n,
        'mean_ms': round(mean, 2),
        'median_ms': round(statistics.median(times_ms), 2),
        'std_dev_ms': round(sd, 2),
        'ci_95_ms': round(ci_95, 2),
        'p95_ms': round(sorted_ms[int(0.95 * n)], 2) if n >= 20 else round(max(times_ms), 2),
        'min_ms': round(min(times_ms), 2),
        'max_ms': round(max(times_ms), 2),
    }


from django.conf import settings
from django.core.cache import cache
from django.test import override_settings

@pytest.mark.django_db
def test_api_latency(auth_client, bench_event):
    cache.clear()
    unthrottled_rf = {
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_CLASSES': (),
        'DEFAULT_THROTTLE_RATES': {},
    }
    with override_settings(REST_FRAMEWORK=unthrottled_rf):
        iterations = 30
        results = {}

    # Event Create
    times = []
    for i in range(iterations):
        start = time.perf_counter()
        res = auth_client.post('/api/events/', {
            'name': f'Latency Event {i}',
            'date': str(timezone.localdate() + timedelta(days=5)),
            'time': '12:00:00',
            'mode': 'offline',
            'status': 'PLANNING'
        }, format='json')
        times.append(time.perf_counter() - start)
        assert res.status_code == 201, res.json()
    record_stats('post_event', times, results)

    # Event List
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        auth_client.get('/api/events/')
        times.append(time.perf_counter() - start)
    record_stats('get_events', times, results)

    # Task Create
    times = []
    for i in range(iterations):
        start = time.perf_counter()
        res = auth_client.post('/api/tasks/', {
            'title': f'Task {i}',
            'event': bench_event.id,
            'status': 'pending',
            'priority': 'low',
            'due_date': str(timezone.localdate() + timedelta(days=2))
        }, format='json')
        times.append(time.perf_counter() - start)
        assert res.status_code == 201, res.json()
    record_stats('post_task', times, results)

    # Task List
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        auth_client.get('/api/tasks/')
        times.append(time.perf_counter() - start)
    record_stats('get_tasks', times, results)

    # Budget Create
    times = []
    for i in range(iterations):
        start = time.perf_counter()
        res = auth_client.post('/api/budget/', {
            'event': bench_event.id,
            'type': 'expense',
            'title': f'Exp {i}',
            'estimated': 100,
            'actual': 0
        }, format='json')
        times.append(time.perf_counter() - start)
        assert res.status_code == 201, res.json()
    record_stats('post_budget', times, results)

    # Budget List
    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        auth_client.get('/api/budget/')
        times.append(time.perf_counter() - start)
    record_stats('get_budget', times, results)

    # Analytics Summary (with cache clearing to prevent queryset caching artifacts)
    from django.db import reset_queries, connection
    times = []
    for _ in range(iterations):
        reset_queries()
        connection.queries_log.clear()
        start = time.perf_counter()
        auth_client.get('/api/analytics/summary/')
        times.append(time.perf_counter() - start)
    record_stats('get_analytics', times, results)

    output_path = os.path.join(RESULTS_DIR, 'api_latency.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
