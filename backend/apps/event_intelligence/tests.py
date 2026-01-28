from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from apps.events.models import Event
from apps.event_intelligence.services import compute_event_profile
from apps.event_intelligence.models import EventProfile

class EventIntelligenceAPITests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='owner', password='pass')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.event = Event.objects.create(
            owner=self.user,
            name='Test Event',
            description='',
            date='2030-01-01',
            time='10:00:00',
            mode='online',
            status='DRAFT',
        )

    def test_intelligence_endpoint(self):
        url = reverse('event-detail', args=[self.event.id]) + 'intelligence/'
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertIn('risk_score', resp.data)
        self.assertTrue(EventProfile.objects.filter(event=self.event).exists())

    def test_compute_creates_profile(self):
        profile = compute_event_profile(self.event)
        self.assertIsInstance(profile, EventProfile)
        self.assertEqual(profile.event, self.event)
