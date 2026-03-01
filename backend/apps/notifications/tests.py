"""Tests for the Notification system."""
import pytest
from apps.notifications.models import Notification
from apps.notifications.utils import create_notification, notify_event_owner


@pytest.mark.django_db
class TestNotificationModel:
    def test_create_notification(self, user):
        n = Notification.objects.create(
            recipient=user,
            type='info',
            title='Test notification',
            body='Hello world',
        )
        assert n.is_read is False
        assert str(n) == f'[info] Test notification → {user.username}'


@pytest.mark.django_db
class TestNotificationUtils:
    def test_create_notification_util(self, user):
        n = create_notification(user, 'Test', 'Body', type='warning')
        assert n is not None
        assert n.recipient == user
        assert n.type == 'warning'

    def test_notify_event_owner(self, event):
        n = notify_event_owner(event, 'Risk high', 'Score exceeded 0.7', type='automation')
        assert n is not None
        assert n.recipient == event.owner
        assert n.event == event


@pytest.mark.django_db
class TestNotificationAPI:
    def test_list_notifications(self, auth_client, user):
        Notification.objects.create(recipient=user, title='N1')
        resp = auth_client.get('/api/notifications/')
        assert resp.status_code == 200

    def test_unread_count(self, auth_client, user):
        Notification.objects.create(recipient=user, title='N1')
        Notification.objects.create(recipient=user, title='N2', is_read=True)
        resp = auth_client.get('/api/notifications/unread_count/')
        assert resp.status_code == 200
        assert resp.data['unread_count'] == 1

    def test_mark_read(self, auth_client, user):
        n = Notification.objects.create(recipient=user, title='N1')
        resp = auth_client.post(f'/api/notifications/{n.id}/mark_read/')
        assert resp.status_code == 200
        n.refresh_from_db()
        assert n.is_read is True

    def test_mark_all_read(self, auth_client, user):
        Notification.objects.create(recipient=user, title='N1')
        Notification.objects.create(recipient=user, title='N2')
        resp = auth_client.post('/api/notifications/mark_all_read/')
        assert resp.status_code == 200
        assert Notification.objects.filter(recipient=user, is_read=False).count() == 0

    def test_other_user_cannot_see_notifications(self, api_client, user, other_user):
        Notification.objects.create(recipient=user, title='Private')
        api_client.force_authenticate(other_user)
        resp = api_client.get('/api/notifications/')
        data = resp.data if isinstance(resp.data, list) else resp.data.get('results', [])
        assert len(data) == 0
