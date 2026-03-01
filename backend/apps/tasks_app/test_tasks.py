"""Tests for Task CRUD and permissions."""
import pytest
from django.utils import timezone
from apps.tasks_app.models import Task


@pytest.mark.django_db
class TestTaskCRUD:
    def test_create_task(self, auth_client, event):
        resp = auth_client.post('/api/tasks/', {
            'title': 'Book venue',
            'event': event.id,
            'priority': 'high',
        })
        assert resp.status_code == 201
        assert resp.data['title'] == 'Book venue'

    def test_list_tasks(self, auth_client, event):
        Task.objects.create(event=event, title='T1')
        resp = auth_client.get('/api/tasks/')
        assert resp.status_code == 200

    def test_update_task_status(self, auth_client, event):
        task = Task.objects.create(event=event, title='T1', status='pending')
        resp = auth_client.patch(f'/api/tasks/{task.id}/', {'status': 'done'})
        assert resp.status_code == 200
        task.refresh_from_db()
        assert task.status == 'done'
        assert task.completed_at is not None

    def test_revert_done_clears_completed_at(self, auth_client, event):
        task = Task.objects.create(event=event, title='T1', status='done', completed_at=timezone.now())
        resp = auth_client.patch(f'/api/tasks/{task.id}/', {'status': 'pending'})
        assert resp.status_code == 200
        task.refresh_from_db()
        assert task.completed_at is None

    def test_delete_task(self, auth_client, event):
        task = Task.objects.create(event=event, title='T1')
        resp = auth_client.delete(f'/api/tasks/{task.id}/')
        assert resp.status_code == 204

    def test_assignee_can_update_status(self, api_client, event, other_user):
        task = Task.objects.create(event=event, title='T1', assignee=other_user)
        api_client.force_authenticate(other_user)
        resp = api_client.patch(f'/api/tasks/{task.id}/', {'status': 'done'})
        assert resp.status_code == 200

    def test_non_participant_cannot_access(self, api_client, event, other_user):
        Task.objects.create(event=event, title='T1')
        api_client.force_authenticate(other_user)
        resp = api_client.get('/api/tasks/')
        data = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        assert len(data) == 0
