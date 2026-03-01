"""Tests for Event CRUD and permissions."""
import pytest
from apps.events.models import Event


@pytest.mark.django_db
class TestEventCRUD:
    def test_create_event(self, auth_client):
        resp = auth_client.post('/api/events/', {
            'name': 'My Event',
            'description': 'Test',
            'date': '2026-07-01',
            'time': '10:00',
            'mode': 'online',
        })
        assert resp.status_code == 201
        assert resp.data['name'] == 'My Event'

    def test_list_events(self, auth_client, event):
        resp = auth_client.get('/api/events/')
        assert resp.status_code == 200
        data = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        assert len(data) >= 1

    def test_update_own_event(self, auth_client, event):
        resp = auth_client.patch(f'/api/events/{event.id}/', {'name': 'Updated'})
        assert resp.status_code == 200
        assert resp.data['name'] == 'Updated'

    def test_delete_own_event(self, auth_client, event):
        resp = auth_client.delete(f'/api/events/{event.id}/')
        assert resp.status_code == 204
        assert not Event.objects.filter(id=event.id).exists()

    def test_cannot_update_others_event(self, api_client, other_user, event):
        api_client.force_authenticate(other_user)
        resp = api_client.patch(f'/api/events/{event.id}/', {'name': 'Hacked'})
        assert resp.status_code in (403, 404)

    def test_unauthenticated_cannot_list(self, api_client):
        resp = api_client.get('/api/events/')
        assert resp.status_code == 401


@pytest.mark.django_db
class TestEventParticipants:
    def test_add_participant(self, auth_client, event, other_user):
        resp = auth_client.patch(f'/api/events/{event.id}/', {
            'participants': [other_user.id],
        })
        assert resp.status_code == 200

    def test_participant_can_view(self, api_client, event_with_participant, other_user):
        api_client.force_authenticate(other_user)
        resp = api_client.get(f'/api/events/{event_with_participant.id}/')
        assert resp.status_code == 200
