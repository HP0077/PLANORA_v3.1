"""AI assistant evaluation benchmark.

Validates prompt construction, structured output parsing, provider fallback,
and context inclusion. Uses mocked LLM providers to avoid external API calls.
"""
import json
import os
import time
from unittest import mock

import pytest

from apps.ai_assistant.llm import groq_client, ollama_client
from apps.ai_assistant.services.prompt_builder import (
    CONTEXT_MAX_CHARS,
    build_description_prompt,
    build_draft_email_prompt,
    build_event_summary_prompt,
    build_prompt,
    build_risk_mitigation_prompt,
    build_task_suggestions_prompt,
)
from apps.ai_assistant.views import DraftEmailView, SuggestTasksView

RESULTS_DIR = os.path.join(os.path.dirname(__file__), 'results')


@pytest.mark.django_db
class TestPromptBuilders:
    """Validate that prompt builders produce correct, bounded, context-rich prompts."""

    def test_build_prompt_includes_context(self, bench_event_full, bench_user):
        result = build_prompt(bench_user, bench_event_full.id, 'What is the risk?')
        prompt = result['prompt']
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert bench_event_full.name in prompt
        assert 'Tasks total:' in prompt
        assert 'Question:' in prompt

    def test_description_prompt_bounded(self):
        prompt = build_description_prompt('Big Conference', 'tech', 'developers', 'AI, ML', 'professional')
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert 'Big Conference' in prompt
        assert 'professional' in prompt.lower()

    def test_task_suggestions_prompt(self, bench_event_full, bench_user):
        prompt = build_task_suggestions_prompt(bench_user, bench_event_full.id, 'focus on catering')
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert 'TASK:' in prompt  # format instruction
        assert 'catering' in prompt

    def test_event_summary_prompt(self, bench_event_full, bench_user):
        prompt = build_event_summary_prompt(bench_user, bench_event_full.id, 'brief')
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert bench_event_full.name in prompt

    def test_risk_mitigation_prompt(self, bench_event_full, bench_user):
        prompt = build_risk_mitigation_prompt(bench_user, bench_event_full.id)
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert 'risk' in prompt.lower()

    def test_draft_email_prompt(self, bench_event_full, bench_user):
        prompt = build_draft_email_prompt(bench_user, bench_event_full.id, 'invitation', 'John', 'Welcome note', 'friendly')
        assert len(prompt) <= CONTEXT_MAX_CHARS
        assert 'invitation' in prompt.lower()
        assert 'John' in prompt


@pytest.mark.django_db
class TestPromptLatency:
    """Measure prompt construction latency."""

    def test_prompt_construction_latency(self, bench_event_full, bench_user):
        times = []
        for _ in range(30):
            start = time.perf_counter()
            build_prompt(bench_user, bench_event_full.id, 'Test question')
            times.append((time.perf_counter() - start) * 1000)  # ms

        import statistics
        results = {
            'prompt_construction_latency_ms': {
                'iterations': 30,
                'mean': statistics.mean(times),
                'median': statistics.median(times),
                'std_dev': statistics.stdev(times),
                'min': min(times),
                'max': max(times),
            }
        }
        output_path = os.path.join(RESULTS_DIR, 'ai_prompt_latency.json')
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)


@pytest.mark.django_db
class TestStructuredOutputParsing:
    """Validate that LLM output parsers handle well-formed and malformed responses."""

    def test_task_parser_valid(self):
        text = (
            "TASK: Book venue | PRIORITY: high | DAYS_BEFORE: 30 | DESC: Reserve the main hall\n"
            "TASK: Hire catering | PRIORITY: medium | DAYS_BEFORE: 14 | DESC: Contact catering vendors\n"
            "TASK: Send invitations | PRIORITY: low | DAYS_BEFORE: 7 | DESC: Email all participants\n"
        )
        view = SuggestTasksView()
        tasks = view._parse_tasks(text)
        assert len(tasks) == 3
        assert tasks[0]['title'] == 'Book venue'
        assert tasks[0]['priority'] == 'high'
        assert tasks[0]['days_before'] == 30

    def test_task_parser_malformed(self):
        text = "Here are some tasks:\n- Book the venue\n- Arrange food\nNo structured format."
        view = SuggestTasksView()
        tasks = view._parse_tasks(text)
        assert len(tasks) == 0  # parser should not crash, just return empty

    def test_email_parser_valid(self):
        text = "SUBJECT: You're Invited!\n---\nDear attendee,\nPlease join us for the event.\nBest regards."
        view = DraftEmailView()
        subject, body = view._parse_email(text)
        assert subject == "You're Invited!"
        assert 'Dear attendee' in body

    def test_email_parser_no_separator(self):
        text = "SUBJECT: Hello\nBody starts here without separator."
        view = DraftEmailView()
        subject, body = view._parse_email(text)
        assert subject == 'Hello'
        assert 'Body starts here' in body


@pytest.mark.django_db
class TestProviderFallback:
    """Validate the dual-provider fallback mechanism."""

    @mock.patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'})
    @mock.patch('apps.ai_assistant.views.groq_client.generate', return_value=('Groq answer', 50))
    def test_groq_primary(self, mock_groq, auth_client, bench_event_full):
        from django.test import override_settings
        with override_settings(AI_PROVIDER='groq'):
            resp = auth_client.post('/api/ai/ask/', {
                'event_id': bench_event_full.id,
                'question': 'What is my risk score?',
            }, format='json')
            assert resp.status_code == 200
            assert resp.json()['used_provider'] == 'groq'
            mock_groq.assert_called_once()

    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('Ollama answer', 30))
    def test_ollama_fallback(self, mock_ollama, auth_client, bench_event_full):
        from django.test import override_settings
        with override_settings(AI_PROVIDER='ollama'):
            resp = auth_client.post('/api/ai/ask/', {
                'event_id': bench_event_full.id,
                'question': 'Budget status?',
            }, format='json')
            assert resp.status_code == 200
            assert resp.json()['used_provider'] == 'ollama'

    @mock.patch.dict(os.environ, {'GROQ_API_KEY': 'test-key'})
    @mock.patch('apps.ai_assistant.views.groq_client.generate', side_effect=RuntimeError('Groq down'))
    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('Fallback answer', 20))
    def test_groq_fails_ollama_fallback(self, mock_ollama, mock_groq, auth_client, bench_event_full):
        from django.test import override_settings
        with override_settings(AI_PROVIDER='groq'):
            resp = auth_client.post('/api/ai/ask/', {
                'event_id': bench_event_full.id,
                'question': 'Help me',
            }, format='json')
            assert resp.status_code == 200
            assert resp.json()['used_provider'] == 'ollama'
            assert resp.json()['answer'] == 'Fallback answer'


@pytest.mark.django_db
class TestAIResponseLatency:
    """Measure end-to-end AI request latency with mocked providers."""

    @mock.patch('apps.ai_assistant.views.ollama_client.generate', return_value=('Test response', 15))
    def test_ask_endpoint_latency(self, mock_gen, auth_client, bench_event_full):
        from django.test import override_settings
        times = []
        with override_settings(AI_PROVIDER='ollama'):
            for _ in range(30):
                start = time.perf_counter()
                auth_client.post('/api/ai/ask/', {
                    'event_id': bench_event_full.id,
                    'question': 'Summary please',
                }, format='json')
                times.append((time.perf_counter() - start) * 1000)

        import statistics
        results = {
            'ai_ask_latency_ms_mocked_llm': {
                'iterations': 30,
                'mean': statistics.mean(times),
                'median': statistics.median(times),
                'std_dev': statistics.stdev(times),
                'min': min(times),
                'max': max(times),
            }
        }
        output_path = os.path.join(RESULTS_DIR, 'ai_evaluation.json')
        with open(output_path, 'w') as f:
            json.dump(results, f, indent=2)
