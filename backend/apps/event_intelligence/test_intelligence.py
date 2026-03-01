"""Tests for Event Intelligence computation."""
import pytest
from django.utils import timezone
from datetime import timedelta

from apps.events.models import Event
from apps.tasks_app.models import Task
from apps.event_intelligence.services import compute_event_profile
from apps.event_intelligence.models import EventProfile


@pytest.mark.django_db
class TestIntelligenceComputation:
    def test_compute_profile_no_data(self, event):
        profile = compute_event_profile(event)
        assert isinstance(profile, EventProfile)
        assert 0 <= profile.risk_score <= 1
        assert profile.readiness_score == 1.0 - profile.risk_score

    def test_overdue_tasks_increase_risk(self, event):
        yesterday = timezone.localdate() - timedelta(days=1)
        Task.objects.create(event=event, title='T1', due_date=yesterday, status='pending')
        Task.objects.create(event=event, title='T2', due_date=yesterday, status='in_progress')
        profile = compute_event_profile(event)
        assert profile.overdue_tasks == 2
        assert profile.risk_score > 0

    def test_done_tasks_dont_count_overdue(self, event):
        yesterday = timezone.localdate() - timedelta(days=1)
        Task.objects.create(event=event, title='T1', due_date=yesterday, status='done')
        profile = compute_event_profile(event)
        assert profile.overdue_tasks == 0

    def test_missing_meeting_link_adds_risk(self, user):
        online_event = Event.objects.create(
            owner=user, name='Online Event',
            date='2026-06-15', time='14:00',
            mode='online', meeting_link='',
        )
        profile = compute_event_profile(online_event)
        assert profile.missing_meeting is True
        assert profile.risk_score > 0

    def test_profile_updates_on_recompute(self, event):
        p1 = compute_event_profile(event)
        Task.objects.create(
            event=event, title='Urgent',
            due_date=timezone.localdate() - timedelta(days=5),
            status='pending',
        )
        p2 = compute_event_profile(event)
        assert p2.risk_score >= p1.risk_score
        assert EventProfile.objects.filter(event=event).count() == 1
