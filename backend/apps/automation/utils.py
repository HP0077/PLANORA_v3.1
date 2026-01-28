"""Lightweight automation trigger helper."""
import logging
from typing import Any, Dict

from .models import AutomationLog

logger = logging.getLogger(__name__)


def run_automation(trigger: str, payload: Dict[str, Any] | None = None) -> None:
    """
    Persist an automation trigger for future processing while logging for visibility.

    For now this writes to AutomationLog and console; future implementations can
    enqueue to external systems without changing callers.
    """
    payload = payload or {}
    logger.info("automation.trigger %s payload=%s", trigger, payload)
    AutomationLog.objects.create(trigger=trigger, payload=payload)
    try:
        from apps.automation_rules.evaluator import evaluate_rules
        evaluate_rules(trigger, payload)
    except Exception as exc:
        logger.exception("automation.rule_evaluator_failed trigger=%s payload=%s exc=%s", trigger, payload, exc)
