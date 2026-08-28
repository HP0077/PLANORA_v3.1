"""conftest.py — shared pytest fixtures for benchmark suite."""
import os
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from django.utils import timezone
from datetime import timedelta

from apps.events.models import Event
from apps.tasks_app.models import Task
from apps.budget.models import BudgetItem
from apps.chats.models import ChatRoom, ChatMembership

# Ensure results directory exists
RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')
os.makedirs(RESULTS_DIR, exist_ok=True)


@pytest.fixture
def bench_user(db):
    return User.objects.create_user(username='benchuser', password='BenchPass123!', email='bench@test.com')


@pytest.fixture
def bench_other(db):
    return User.objects.create_user(username='benchother', password='BenchPass123!', email='other@test.com')


@pytest.fixture
def auth_client(bench_user):
    client = APIClient()
    client.force_authenticate(user=bench_user)
    return client


@pytest.fixture
def bench_event(bench_user):
    return Event.objects.create(
        owner=bench_user,
        name='Benchmark Event',
        description='Event created for benchmark testing',
        date='2030-06-15',
        time='14:00',
        mode='offline',
        status='PLANNING',
    )


@pytest.fixture
def bench_event_with_room(bench_event, bench_user):
    """Event with a chat room and membership for file/budget operations."""
    room = ChatRoom.objects.create(event=bench_event, name='General')
    ChatMembership.objects.create(room=room, user=bench_user)
    return bench_event, room


@pytest.fixture
def bench_event_full(bench_event, bench_user):
    """Event populated with tasks and budget items for intelligence and AI testing."""
    yesterday = timezone.localdate() - timedelta(days=1)
    tomorrow = timezone.localdate() + timedelta(days=1)

    # Mix of overdue and future tasks
    for i in range(3):
        Task.objects.create(
            event=bench_event, title=f'Overdue Task {i}',
            due_date=yesterday, status='pending', priority='high',
        )
    for i in range(4):
        Task.objects.create(
            event=bench_event, title=f'Future Task {i}',
            due_date=tomorrow, status='pending', priority='medium',
        )
    Task.objects.create(
        event=bench_event, title='Done Task',
        due_date=yesterday, status='done', priority='low',
    )

    # Budget items
    for i in range(3):
        BudgetItem.objects.create(
            event=bench_event, type='expense',
            title=f'Expense {i}', estimated=1000, actual=800,
        )
    BudgetItem.objects.create(
        event=bench_event, type='income',
        title='Sponsorship', estimated=5000, actual=5000,
    )

    bench_event.participants.add(bench_user)
    return bench_event
