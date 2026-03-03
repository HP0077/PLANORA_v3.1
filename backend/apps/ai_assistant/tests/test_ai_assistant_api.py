from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.timeline.models import TimelineEntry


class AiAssistantApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(username='owner', email='o@example.com', password='pass1234')
        self.participant = User.objects.create_user(username='participant', email='p@example.com', password='pass1234')
        self.other = User.objects.create_user(username='other', email='x@example.com', password='pass1234')
        self.event = Event.objects.create(
            owner=self.owner,
            name='Launch Event',
            description='Test',
            date='2024-10-10',
            time='10:00:00',
            mode='offline',
            status='PLANNING',
        )
        self.event.participants.add(self.participant)

    def _auth(self, user):
        self.client.force_authenticate(user=user)

    @override_settings(AI_PROVIDER='ollama')
    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('stub-answer', 12))
    def test_owner_can_query_and_logs_timeline(self, mock_gen):
        self._auth(self.owner)
        resp = self.client.post('/api/ai/ask/', {'event_id': self.event.id, 'question': 'Why is my event risky?'}, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['answer'], 'stub-answer')
        self.assertEqual(body['used_provider'], 'ollama')
        # two timeline entries: query + response
        types = list(TimelineEntry.objects.filter(event=self.event).values_list('type', flat=True))
        self.assertIn('ai_query', types)
        self.assertIn('ai_response', types)
        mock_gen.assert_called_once()

    @override_settings(AI_PROVIDER='ollama')
    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('stub-answer', 12))
    def test_participant_can_query(self, _mock_gen):
        self._auth(self.participant)
        resp = self.client.post('/api/ai/ask/', {'event_id': self.event.id, 'question': 'Budget status?'}, format='json')
        self.assertEqual(resp.status_code, 200)

    @override_settings(AI_PROVIDER='groq')
    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('fallback-answer', 8))
    def test_fallback_when_groq_missing_key(self, mock_ollama):
        # When GROQ_API_KEY is absent, _select_providers() skips groq entirely
        # and routes directly to ollama — groq is never attempted.
        self._auth(self.owner)
        resp = self.client.post('/api/ai/ask/', {'event_id': self.event.id, 'question': 'Check risk'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['used_provider'], 'ollama')
        mock_ollama.assert_called_once()

    def test_forbidden_for_non_participant(self):
        self._auth(self.other)
        resp = self.client.post('/api/ai/ask/', {'event_id': self.event.id, 'question': 'Should not see this'}, format='json')
        self.assertEqual(resp.status_code, 403)