"""conftest.py — shared pytest fixtures for all backend tests."""
import pytest
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from apps.events.models import Event


@pytest.fixture
def user(db):
    return User.objects.create_user(username='alice', password='testpass123', email='alice@test.com')


@pytest.fixture
def other_user(db):
    return User.objects.create_user(username='bob', password='testpass123', email='bob@test.com')


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def event(user):
    return Event.objects.create(
        owner=user,
        name='Test Event',
        description='A test event',
        date='2026-06-15',
        time='14:00',
        mode='offline',
        status='PLANNING',
    )


@pytest.fixture
def event_with_participant(event, other_user):
    event.participants.add(other_user)
    return event
