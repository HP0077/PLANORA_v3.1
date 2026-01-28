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
from .permissions import IsEventOwnerOrParticipant
from .serializers import AskSerializer
from .services.prompt_builder import build_prompt

logger = logging.getLogger(__name__)


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

        try:
            prompt_data = build_prompt(request.user, event_id, question)
        except PermissionError:
            raise PermissionDenied('Not allowed for this event')
        except ValueError as exc:
            raise ValidationError({'event_id': str(exc)})

        provider_order = self._select_providers()
        answer = None
        used_provider: Optional[str] = None
        tokens_estimate = 0
        last_error: Optional[str] = None

        for provider in provider_order:
            try:
                answer, tokens_estimate = self._generate(provider, prompt_data['prompt'])
                used_provider = provider
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("ai_assistant.provider_failed provider=%s exc=%s", provider, exc)
                last_error = str(exc)
                continue

        if not answer:
            return Response({'detail': f"AI provider unavailable. {last_error or 'Try again later.'}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

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
        })

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
