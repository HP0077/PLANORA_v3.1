from __future__ import annotations

import logging
import os
from typing import Optional, Tuple

from django.conf import settings
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.automation.utils import run_automation
from apps.timeline.models import TimelineEntry

from .llm import groq_client, ollama_client
from .models import Conversation, ConversationMessage
from .permissions import IsEventOwnerOrParticipant
from .serializers import (
    AskSerializer,
    GenerateDescriptionSerializer,
    SuggestTasksSerializer,
    EventSummarySerializer,
    RiskMitigationSerializer,
    DraftEmailSerializer,
)
from .services.prompt_builder import (
    build_prompt,
    build_description_prompt,
    build_task_suggestions_prompt,
    build_event_summary_prompt,
    build_risk_mitigation_prompt,
    build_draft_email_prompt,
)

logger = logging.getLogger(__name__)

MAX_HISTORY_TURNS = 10  # last N messages to include as context


class AskView(APIView):
    """Handle AI assistant queries for event-scoped context."""

    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = AskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event_id = serializer.validated_data['event_id']
        question = serializer.validated_data['question']
        conversation_id = serializer.validated_data.get('conversation_id')

        try:
            prompt_data = build_prompt(request.user, event_id, question)
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        # Resolve or create conversation
        conversation = self._get_or_create_conversation(request.user, event_id, conversation_id)

        # Build history-aware prompt
        history = self._get_history(conversation)
        full_prompt = self._build_multi_turn_prompt(prompt_data['prompt'], history, question)

        provider_order = self._select_providers()
        answer = None
        used_provider: Optional[str] = None
        tokens_estimate = 0
        last_error: Optional[str] = None

        for provider in provider_order:
            try:
                answer, tokens_estimate = self._generate(provider, full_prompt)
                used_provider = provider
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("ai_assistant.provider_failed provider=%s exc=%s", provider, exc)
                last_error = str(exc)
                continue

        if not answer:
            return Response({'detail': f"AI provider unavailable. {last_error or 'Try again later.'}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Persist conversation turns
        ConversationMessage.objects.create(conversation=conversation, role='user', content=question)
        ConversationMessage.objects.create(conversation=conversation, role='assistant', content=answer)

        self._log_timeline(event_id, request.user, 'ai_query', {
            'question': prompt_data['question'],
            'provider': used_provider,
        })
        self._log_timeline(event_id, request.user, 'ai_response', {
            'summary': answer[:240],
            'provider': used_provider,
        })
        run_automation('ai_used', {'event_id': event_id, 'user_id': request.user.id, 'provider': used_provider})

        return Response({
            'answer': answer,
            'used_provider': used_provider,
            'tokens_estimate': tokens_estimate,
            'conversation_id': conversation.id,
        })

    def _get_or_create_conversation(self, user, event_id, conversation_id):
        if conversation_id:
            try:
                return Conversation.objects.get(id=conversation_id, user=user, event_id=event_id)
            except Conversation.DoesNotExist:
                pass
        return Conversation.objects.create(user=user, event_id=event_id)

    def _get_history(self, conversation):
        return list(
            ConversationMessage.objects
            .filter(conversation=conversation)
            .order_by('-created_at')[:MAX_HISTORY_TURNS * 2]
        )[::-1]  # reverse to chronological

    def _build_multi_turn_prompt(self, base_prompt, history, current_question):
        if not history:
            return base_prompt
        history_text = "\n".join(
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content[:300]}"
            for m in history[-MAX_HISTORY_TURNS * 2:]
        )
        return f"{base_prompt}\n\nConversation history:\n{history_text}\n\nUser: {current_question}\nAssistant:"

    def _select_providers(self) -> Tuple[str, ...]:
        provider = getattr(settings, 'AI_PROVIDER', 'ollama').lower()
        groq_key = os.environ.get('GROQ_API_KEY')
        order = []
        if provider == 'groq' and groq_key:
            order.extend(['groq', 'ollama'])
        elif provider == 'groq' and not groq_key:
            order.append('ollama')
        elif provider == 'ollama':
            order.append('ollama')
            if groq_key:
                order.append('groq')
        else:
            order.append('ollama')
            if groq_key:
                order.append('groq')
        return tuple(order)

    def _generate(self, provider: str, prompt: str):
        if provider == 'groq':
            return groq_client.generate(prompt)
        return ollama_client.generate(prompt)

    def _log_timeline(self, event_id: int, user, type_: str, payload: dict):
        try:
            TimelineEntry.objects.create(
                event_id=event_id,
                actor=user,
                type=type_,
                source='ai_assistant',
                payload={**(payload or {}), 'snapshot': {}},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("ai_assistant.timeline_log_failed event_id=%s type=%s exc=%s", event_id, type_, exc)


# ---------------------------------------------------------------------------
# Helper mixin for LLM generation with fallback
# ---------------------------------------------------------------------------

class _LLMGenerateMixin:
    """Shared LLM provider selection and generation logic."""

    def _select_providers(self) -> Tuple[str, ...]:
        provider = getattr(settings, 'AI_PROVIDER', 'ollama').lower()
        groq_key = os.environ.get('GROQ_API_KEY')
        order = []
        if provider == 'groq' and groq_key:
            order.extend(['groq', 'ollama'])
        elif provider == 'groq' and not groq_key:
            order.append('ollama')
        elif provider == 'ollama':
            order.append('ollama')
            if groq_key:
                order.append('groq')
        else:
            order.append('ollama')
            if groq_key:
                order.append('groq')
        return tuple(order)

    def _generate(self, provider: str, prompt: str):
        if provider == 'groq':
            return groq_client.generate(prompt)
        return ollama_client.generate(prompt)

    def _generate_with_fallback(self, prompt: str):
        """Try each provider in order; return (answer, provider, tokens) or raise."""
        provider_order = self._select_providers()
        last_error = None
        for provider in provider_order:
            try:
                answer, tokens = self._generate(provider, prompt)
                return answer, provider, tokens
            except Exception as exc:  # noqa: BLE001
                logger.warning("ai_tool.provider_failed provider=%s exc=%s", provider, exc)
                last_error = str(exc)
        raise RuntimeError(f"All AI providers unavailable. {last_error or ''}")


# ---------------------------------------------------------------------------
# Tier 1 – Feature 1: AI Event Description Generator
# ---------------------------------------------------------------------------

class GenerateDescriptionView(_LLMGenerateMixin, APIView):
    """Generate a polished event description using AI."""

    permission_classes = [IsAuthenticated]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = GenerateDescriptionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        prompt = build_description_prompt(
            event_name=d['event_name'],
            event_type=d.get('event_type', ''),
            audience=d.get('audience', ''),
            keywords=d.get('keywords', ''),
            tone=d.get('tone', 'professional'),
        )

        try:
            answer, used_provider, tokens = self._generate_with_fallback(prompt)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({
            'description': answer,
            'used_provider': used_provider,
            'tokens_estimate': tokens,
        })


# ---------------------------------------------------------------------------
# Tier 1 – Feature 2: Smart Task Suggestions
# ---------------------------------------------------------------------------

class SuggestTasksView(_LLMGenerateMixin, APIView):
    """Suggest tasks for an event using AI."""

    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = SuggestTasksSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        event_id = ser.validated_data['event_id']
        additional = ser.validated_data.get('additional_context', '')

        try:
            prompt = build_task_suggestions_prompt(request.user, event_id, additional)
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        try:
            answer, used_provider, tokens = self._generate_with_fallback(prompt)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Parse structured task suggestions
        tasks = self._parse_tasks(answer)

        return Response({
            'raw_answer': answer,
            'tasks': tasks,
            'used_provider': used_provider,
            'tokens_estimate': tokens,
        })

    def _parse_tasks(self, text: str):
        """Best-effort parse TASK: ... | PRIORITY: ... | DAYS_BEFORE: ... | DESC: ... lines."""
        import re
        tasks = []
        for line in text.split('\n'):
            m = re.search(
                r'TASK:\s*(.+?)\s*\|\s*PRIORITY:\s*(\w+)\s*\|\s*DAYS_BEFORE:\s*(\d+)\s*\|\s*DESC:\s*(.+)',
                line, re.IGNORECASE,
            )
            if m:
                tasks.append({
                    'title': m.group(1).strip(),
                    'priority': m.group(2).strip().lower(),
                    'days_before': int(m.group(3)),
                    'description': m.group(4).strip(),
                })
        return tasks


# ---------------------------------------------------------------------------
# Tier 1 – Feature 3: Event Status Summary / Report
# ---------------------------------------------------------------------------

class EventSummaryView(_LLMGenerateMixin, APIView):
    """Generate a human-readable status report for an event."""

    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = EventSummarySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        event_id = ser.validated_data['event_id']
        fmt = ser.validated_data.get('format', 'brief')

        try:
            prompt = build_event_summary_prompt(request.user, event_id, fmt)
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        try:
            answer, used_provider, tokens = self._generate_with_fallback(prompt)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({
            'summary': answer,
            'format': fmt,
            'used_provider': used_provider,
            'tokens_estimate': tokens,
        })


# ---------------------------------------------------------------------------
# Tier 1 – Feature 4: Risk Mitigation Suggestions
# ---------------------------------------------------------------------------

class RiskMitigationView(_LLMGenerateMixin, APIView):
    """Generate specific risk mitigation actions for an event."""

    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = RiskMitigationSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        event_id = ser.validated_data['event_id']

        try:
            prompt = build_risk_mitigation_prompt(request.user, event_id)
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        try:
            answer, used_provider, tokens = self._generate_with_fallback(prompt)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        return Response({
            'mitigation_plan': answer,
            'used_provider': used_provider,
            'tokens_estimate': tokens,
        })


# ---------------------------------------------------------------------------
# Tier 2 – Feature 5: Smart Email / Invitation Drafter
# ---------------------------------------------------------------------------

class DraftEmailView(_LLMGenerateMixin, APIView):
    """Draft event-related emails using AI."""

    permission_classes = [IsAuthenticated, IsEventOwnerOrParticipant]
    throttle_scope = 'ai_query'
    throttle_classes = [ScopedRateThrottle]

    def post(self, request, *args, **kwargs):
        ser = DraftEmailSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data

        try:
            prompt = build_draft_email_prompt(
                user=request.user,
                event_id=d['event_id'],
                template_type=d['template_type'],
                recipient_name=d.get('recipient_name', ''),
                additional_notes=d.get('additional_notes', ''),
                tone=d.get('tone', 'professional'),
            )
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        try:
            answer, used_provider, tokens = self._generate_with_fallback(prompt)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        # Parse subject and body
        subject, body = self._parse_email(answer)

        return Response({
            'raw_output': answer,
            'subject': subject,
            'body': body,
            'template_type': d['template_type'],
            'used_provider': used_provider,
            'tokens_estimate': tokens,
        })

    def _parse_email(self, text: str):
        """Best-effort parse SUBJECT: ... --- <body> from LLM output."""
        subject = ''
        body = text
        lines = text.strip().split('\n')
        for i, line in enumerate(lines):
            if line.strip().upper().startswith('SUBJECT:'):
                subject = line.split(':', 1)[1].strip()
                # Body is everything after the --- separator or the next line
                rest = lines[i + 1:]
                # Skip separator line if present
                if rest and rest[0].strip().startswith('---'):
                    rest = rest[1:]
                body = '\n'.join(rest).strip()
                break
        return subject, body
