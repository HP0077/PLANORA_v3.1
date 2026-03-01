"""Tests for Analytics API."""
import pytest
from apps.events.models import Event
from apps.tasks_app.models import Task
from apps.budget.models import BudgetItem


@pytest.mark.django_db
class TestAnalyticsAPI:
    def test_summary_authenticated(self, auth_client, event):
        Task.objects.create(event=event, title='T1', priority='high', status='pending')
        Task.objects.create(event=event, title='T2', priority='low', status='done')
        BudgetItem.objects.create(event=event, type='expense', title='Venue', estimated=500, actual=450)
        resp = auth_client.get('/api/analytics/summary/')
        assert resp.status_code == 200
        data = resp.data
        assert data['total_events'] >= 1
        assert data['total_tasks'] >= 2
        assert 'task_by_status' in data
        assert 'task_by_priority' in data
        assert 'budget' in data
        assert data['budget']['total_estimated'] >= 500
        # new fields
        assert 'event_list' in data
        assert 'completion_pct' in data
        assert 'utilisation_pct' in data['budget']

    def test_summary_unauthenticated(self, api_client):
        resp = api_client.get('/api/analytics/summary/')
        assert resp.status_code == 401

    def test_summary_only_own_events(self, api_client, event, other_user):
        api_client.force_authenticate(other_user)
        resp = api_client.get('/api/analytics/summary/')
        assert resp.status_code == 200
        assert resp.data['total_events'] == 0

    def test_filter_by_event_id(self, auth_client, user, event):
        """Passing ?event_id scopes metrics to that single event."""
        other_event = Event.objects.create(
            owner=user, name='Other', date='2025-12-01', time='09:00'
        )
        Task.objects.create(event=event, title='A', status='done')
        Task.objects.create(event=other_event, title='B', status='pending')

        resp = auth_client.get(f'/api/analytics/summary/?event_id={event.id}')
        assert resp.status_code == 200
        data = resp.data
        assert data['total_events'] == 1
        assert data['total_tasks'] == 1
        assert data['selected_event'] is not None
        assert data['selected_event']['name'] == event.name
