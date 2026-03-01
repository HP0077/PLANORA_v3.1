"""Tests for Budget CRUD and health computation."""
import pytest
from apps.budget.models import BudgetItem, BudgetHealth


@pytest.mark.django_db
class TestBudgetCRUD:
    def test_create_budget_item(self, auth_client, event):
        resp = auth_client.post('/api/budget/', {
            'event': event.id,
            'type': 'expense',
            'title': 'Venue rental',
            'estimated': 500,
            'actual': 0,
        })
        assert resp.status_code == 201
        assert resp.data['title'] == 'Venue rental'

    def test_list_budget_items(self, auth_client, event):
        BudgetItem.objects.create(event=event, type='expense', title='Food', estimated=200)
        resp = auth_client.get(f'/api/budget/?event={event.id}')
        assert resp.status_code == 200

    def test_delete_budget_item(self, auth_client, event):
        item = BudgetItem.objects.create(event=event, type='expense', title='Food', estimated=200)
        resp = auth_client.delete(f'/api/budget/{item.id}/')
        assert resp.status_code == 204

    def test_budget_summary(self, auth_client, event):
        BudgetItem.objects.create(event=event, type='expense', title='A', estimated=100, actual=120)
        resp = auth_client.get(f'/api/budget/summary/?event_id={event.id}')
        assert resp.status_code == 200

    def test_unauthenticated_access(self, api_client, event):
        resp = api_client.get(f'/api/budget/?event={event.id}')
        assert resp.status_code == 401
