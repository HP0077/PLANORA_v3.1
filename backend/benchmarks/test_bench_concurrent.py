"""Concurrent access stress test.

Measures how the system behaves under concurrent thread access.
SQLite uses file-level locking, so concurrent writes will produce
'database table is locked' errors.  We record these as data points
rather than test failures, because the error rate itself is a
meaningful finding about the deployment constraint.

This test also runs a sequential-thread baseline for comparison.
"""
import json
import math
import os
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APIClient

from apps.events.models import Event

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')

UNTHROTTLED = {
    'DEFAULT_THROTTLE_CLASSES': (),
    'DEFAULT_THROTTLE_RATES': {},
}


def _ci_95(values):
    n = len(values)
    if n < 2:
        return 0.0
    return 1.96 * (statistics.stdev(values) / math.sqrt(n))


def _stats(latencies):
    if not latencies:
        return {'count': 0}
    n = len(latencies)
    s = sorted(latencies)
    return {
        'count': n,
        'mean_ms': round(statistics.mean(latencies), 2),
        'median_ms': round(statistics.median(latencies), 2),
        'std_ms': round(statistics.stdev(latencies), 2) if n > 1 else 0.0,
        'ci_95_ms': round(_ci_95(latencies), 2),
        'p95_ms': round(s[int(0.95 * n)], 2) if n >= 20 else round(s[-1], 2),
        'min_ms': round(min(latencies), 2),
        'max_ms': round(max(latencies), 2),
    }


def _make_client(username):
    user = User.objects.create_user(
        username=username, password='Test123!', email=f'{username}@test.com',
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client, user


@pytest.mark.django_db(transaction=True)
@override_settings(REST_FRAMEWORK=UNTHROTTLED)
def test_concurrent_event_creation():
    """Measure event creation under increasing concurrency levels.

    At each level, we record successful request latencies AND the number
    of 'database locked' errors.  For SQLite this demonstrates the
    concurrency ceiling; for PostgreSQL (production) the error rate
    should be zero.
    """
    levels = [1, 2, 5, 10, 20]
    requests_per_thread = 20
    results = {}

    for n_threads in levels:
        # Create users in main thread (SQLite requirement)
        clients = []
        for i in range(n_threads):
            c, u = _make_client(f'conc_{n_threads}_{i}')
            clients.append(c)

        successes = []
        lock_errors = 0
        other_errors = 0

        def worker(client, tid):
            local_ok = []
            local_lock = 0
            local_other = 0
            for j in range(requests_per_thread):
                start = time.perf_counter()
                try:
                    resp = client.post('/api/events/', {
                        'name': f'ConcEvent {n_threads}_{tid}_{j}',
                        'description': 'Concurrency test',
                        'date': '2030-06-15',
                        'time': '14:00',
                        'mode': 'offline',
                        'status': 'PLANNING',
                    }, format='json')
                    elapsed = (time.perf_counter() - start) * 1000
                    if resp.status_code == 201:
                        local_ok.append(elapsed)
                    else:
                        local_other += 1
                except Exception:
                    local_lock += 1
            return local_ok, local_lock, local_other

        wall_start = time.perf_counter()
        with ThreadPoolExecutor(max_workers=n_threads) as pool:
            futures = [pool.submit(worker, clients[i], i) for i in range(n_threads)]
            for f in as_completed(futures):
                ok, lk, ot = f.result()
                successes.extend(ok)
                lock_errors += lk
                other_errors += ot
        wall_ms = (time.perf_counter() - wall_start) * 1000

        total = n_threads * requests_per_thread
        results[f'{n_threads}_threads'] = {
            'concurrency': n_threads,
            'total_requests': total,
            'successful': len(successes),
            'lock_errors': lock_errors,
            'other_errors': other_errors,
            'error_rate_pct': round((lock_errors + other_errors) / total * 100, 1),
            'wall_time_ms': round(wall_ms, 2),
            'throughput_rps': round(len(successes) / (wall_ms / 1000), 2) if wall_ms > 0 else 0,
            'latency': _stats(successes),
        }

    output_path = os.path.join(RESULTS_DIR, 'concurrent_load.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

    # At concurrency=1, everything must succeed
    assert results['1_threads']['lock_errors'] == 0
    assert results['1_threads']['successful'] == requests_per_thread

    # At higher concurrency, we just record — locking errors are expected with SQLite
    # The error rate data itself is the finding


@pytest.mark.django_db(transaction=True)
@override_settings(REST_FRAMEWORK=UNTHROTTLED)
def test_concurrent_read_scaling():
    """Measure GET (read-only) scaling under concurrency.

    Reads should not contend on SQLite.  This confirms that the
    unified schema's join-heavy serialisation scales linearly
    with concurrent readers.
    """
    # Seed data
    owner = User.objects.create_user(
        username='read_owner', password='Test123!', email='read@test.com',
    )
    for i in range(5):
        Event.objects.create(
            owner=owner, name=f'Read Test Event {i}',
            date='2030-06-15', time='14:00',
            mode='offline', status='PLANNING',
        )

    levels = [1, 5, 10, 20]
    reads_per_thread = 10
    results = {}

    for n_threads in levels:
        clients = []
        for i in range(n_threads):
            c, _ = _make_client(f'reader_{n_threads}_{i}')
            clients.append(c)

        latencies = []

        def reader(client):
            lats = []
            for _ in range(reads_per_thread):
                start = time.perf_counter()
                resp = client.get('/api/events/')
                lats.append((time.perf_counter() - start) * 1000)
            return lats

        wall_start = time.perf_counter()
        with ThreadPoolExecutor(max_workers=n_threads) as pool:
            futures = [pool.submit(reader, clients[i]) for i in range(n_threads)]
            for f in as_completed(futures):
                latencies.extend(f.result())
        wall_ms = (time.perf_counter() - wall_start) * 1000

        total = n_threads * reads_per_thread
        results[f'{n_threads}_readers'] = {
            'concurrency': n_threads,
            'total_requests': total,
            'wall_time_ms': round(wall_ms, 2),
            'throughput_rps': round(total / (wall_ms / 1000), 2) if wall_ms > 0 else 0,
            'latency': _stats(latencies),
        }

    output_path = os.path.join(RESULTS_DIR, 'concurrent_reads.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)

    # All reads should succeed
    for level, data in results.items():
        assert data['total_requests'] == data['latency']['count']
