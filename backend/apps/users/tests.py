"""Tests for user authentication and profile endpoints."""
import pytest
from django.contrib.auth.models import User


@pytest.mark.django_db
class TestUserRegistration:
    def test_register_success(self, api_client):
        resp = api_client.post('/api/users/register/', {
            'username': 'newuser',
            'email': 'new@test.com',
            'password': 'StrongPass123!',
            'first_name': 'New',
            'last_name': 'User',
            'role': 'attendee',
        })
        assert resp.status_code in (200, 201)
        assert User.objects.filter(username='newuser').exists()

    def test_register_duplicate_username(self, api_client, user):
        resp = api_client.post('/api/users/register/', {
            'username': 'alice',
            'email': 'other@test.com',
            'password': 'StrongPass123!',
        })
        assert resp.status_code == 400


@pytest.mark.django_db
class TestUserAuth:
    def test_obtain_token(self, api_client, user):
        resp = api_client.post('/api/users/token/', {
            'username': 'alice',
            'password': 'testpass123',
        })
        assert resp.status_code == 200
        assert 'access' in resp.data
        assert 'refresh' in resp.data

    def test_token_refresh(self, api_client, user):
        token_resp = api_client.post('/api/users/token/', {
            'username': 'alice',
            'password': 'testpass123',
        })
        refresh = token_resp.data['refresh']
        resp = api_client.post('/api/users/token/refresh/', {'refresh': refresh})
        assert resp.status_code == 200
        assert 'access' in resp.data

    def test_invalid_credentials(self, api_client, user):
        resp = api_client.post('/api/users/token/', {
            'username': 'alice',
            'password': 'wrongpassword',
        })
        assert resp.status_code == 401


@pytest.mark.django_db
class TestUserMe:
    def test_me_authenticated(self, auth_client, user):
        resp = auth_client.get('/api/users/me/')
        assert resp.status_code == 200
        assert resp.data['username'] == 'alice'

    def test_me_unauthenticated(self, api_client):
        resp = api_client.get('/api/users/me/')
        assert resp.status_code == 401
