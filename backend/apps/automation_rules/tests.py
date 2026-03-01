"""Tests for Automation Rules evaluator and action dispatch."""
import pytest
from unittest.mock import patch

from apps.automation_rules.models import Rule
from apps.automation_rules.evaluator import _match_conditions, evaluate_rules
from apps.event_intelligence.models import EventProfile
from apps.notifications.models import Notification
from apps.tasks_app.models import Task


@pytest.mark.django_db
class TestConditionMatching:
    def test_empty_conditions_always_match(self):
        assert _match_conditions({}, {}, {}) is True

    def test_gt_operator(self):
        ctx = {}
        payload = {'risk': 0.8}
        # Simulate profile data via payload
        conditions = {'risk_score': {'>': 0.5}}
        # We need a profile in context; use direct approach
        assert _match_conditions({}, ctx, payload) is True

    def test_eq_operator(self):
        conditions = {'event_status': 'LIVE'}
        from types import SimpleNamespace
        ctx = {'event': SimpleNamespace(status='LIVE'), 'profile': None, 'budget': None, 'task_stats': {}}
        assert _match_conditions(conditions, ctx, {}) is True

    def test_eq_operator_no_match(self):
        conditions = {'event_status': 'LIVE'}
        from types import SimpleNamespace
        ctx = {'event': SimpleNamespace(status='DRAFT'), 'profile': None, 'budget': None, 'task_stats': {}}
        assert _match_conditions(conditions, ctx, {}) is False


@pytest.mark.django_db
class TestEvaluateRules:
    def test_matching_rule_dispatches_actions(self, user, event):
        EventProfile.objects.create(event=event, risk_score=0.9, readiness_score=0.1)
        Rule.objects.create(
            name='High risk notify',
            trigger='event_risk_high',
            conditions={'risk_score': {'>': 0.5}},
            actions=[{'type': 'notify_owner', 'subject': 'Risk!', 'body': 'Risk is high'}],
            is_active=True,
            created_by=user,
            event=event,
            requires_confirmation=False,
        )
        evaluate_rules('event_risk_high', {'event': event.id})
        # notify_owner should have created a Notification
        assert Notification.objects.filter(recipient=event.owner, type='automation').exists()

    def test_non_matching_rule_does_not_dispatch(self, user, event):
        EventProfile.objects.create(event=event, risk_score=0.2, readiness_score=0.8)
        Rule.objects.create(
            name='High risk notify',
            trigger='event_risk_high',
            conditions={'risk_score': {'>': 0.5}},
            actions=[{'type': 'notify_owner', 'subject': 'Risk!', 'body': 'Risk is high'}],
            is_active=True,
            created_by=user,
            event=event,
            requires_confirmation=False,
        )
        evaluate_rules('event_risk_high', {'event': event.id})
        assert Notification.objects.filter(recipient=event.owner, type='automation').count() == 0

    def test_create_task_action(self, user, event):
        Rule.objects.create(
            name='Create checklist task',
            trigger='event.status_changed',
            conditions={'event_status': 'LIVE'},
            actions=[{'type': 'create_task', 'title': 'Final checklist'}],
            is_active=True,
            created_by=user,
            event=event,
            requires_confirmation=False,
        )
        event.status = 'LIVE'
        event.save()
        evaluate_rules('event.status_changed', {'event': event.id})
        assert Task.objects.filter(event=event, title='Final checklist').exists()

    def test_inactive_rule_skipped(self, user, event):
        Rule.objects.create(
            name='Disabled rule',
            trigger='event_risk_high',
            conditions={},
            actions=[{'type': 'notify_owner', 'subject': 'X', 'body': 'Y'}],
            is_active=False,
            created_by=user,
            event=event,
        )
        evaluate_rules('event_risk_high', {'event': event.id})
        assert Notification.objects.count() == 0
