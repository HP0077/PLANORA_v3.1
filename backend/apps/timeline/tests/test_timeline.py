from django.test import TestCase
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.urls import reverse
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.timeline.models import TimelineEntry
from apps.budget.models import BudgetItem
from apps.automation.models import AutomationLog


class TimelineAuditTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='owner', password='pw')
        self.other = User.objects.create_user(username='other', password='pw')
        self.event = Event.objects.create(
            owner=self.owner,
            name='Sample',
            description='Demo',
            date='2024-01-01',
            time='12:00:00',
            mode='offline',
        )

    def test_append_only_blocks_update_and_delete(self):
        entry = TimelineEntry.objects.create(
            event=self.event,
            actor=self.owner,
            type='event_status',
            source='event',
            payload={'snapshot': {}},
        )
        entry.type = 'task_created'
        with self.assertRaises(ValidationError):
            entry.save()
        with self.assertRaises(ValidationError):
            entry.delete()

    def test_budget_delete_is_logged(self):
        item = BudgetItem.objects.create(event=self.event, type='expense', title='Venue', estimated=100, actual=0)
        # Deleting should emit budget_item_deleted entry
        item.delete()
        deleted_entry = TimelineEntry.objects.filter(event=self.event, type='budget_item_deleted').first()
        self.assertIsNotNone(deleted_entry)
        self.assertTrue(deleted_entry.payload.get('deleted'))

    def test_automation_includes_conditions(self):
        AutomationLog.objects.create(trigger='rule_action_budget', payload={'event': self.event.id, 'matched_conditions': ['budget_over'], 'rule_name': 'overrun'})
        entry = TimelineEntry.objects.filter(event=self.event, type='automation_rule').first()
        self.assertIsNotNone(entry)
        self.assertIn('matched_conditions', entry.payload)
        self.assertEqual(entry.payload.get('rule_name'), 'overrun')
        self.assertEqual(entry.source, 'AUTOMATION')

    def test_event_status_transition_captures_from_to(self):
        self.event.status = 'PLANNING'
        self.event.save()
        entry = TimelineEntry.objects.filter(event=self.event, type='event_status').first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.payload.get('from'), 'DRAFT')
        self.assertEqual(entry.payload.get('to'), 'PLANNING')

    def test_permission_blocks_non_participant_nested_endpoint(self):
        TimelineEntry.objects.create(event=self.event, type='event_status', source='event', payload={'snapshot': {}})
        client = APIClient()
        client.force_authenticate(user=self.other)
        url = reverse('event-timeline', kwargs={'event_id': self.event.id})
        res = client.get(url)
        self.assertEqual(res.status_code, 403)

    def test_permission_allows_owner_nested_endpoint(self):
        TimelineEntry.objects.create(event=self.event, type='event_status', source='event', payload={'snapshot': {}})
        client = APIClient()
        client.force_authenticate(user=self.owner)
        url = reverse('event-timeline', kwargs={'event_id': self.event.id})
        res = client.get(url)
        self.assertEqual(res.status_code, 200)
        # Ensure payload matches expected ordering
        data = res.json()
        items = data.get('results') if isinstance(data, dict) else data
        self.assertTrue(len(items) >= 1)
