"""Budget domain services for health calculations."""
from decimal import Decimal
from typing import Dict

from django.db import transaction
from django.db.models import Sum, Case, When, DecimalField, F, Value
from django.db.models.functions import Coalesce

from apps.automation.utils import run_automation
from .models import BudgetHealth, BudgetItem


WARNING_THRESHOLD = Decimal('0.90')  # warning when actual reaches 90% of estimate


def recalc_budget_health(event_id: int) -> BudgetHealth:
    """Recalculate totals and health status for an event's budget."""
    zero = Value(0, output_field=DecimalField(max_digits=14, decimal_places=2))
    totals: Dict[str, Decimal] = BudgetItem.objects.filter(event_id=event_id).aggregate(
        total_estimated=Coalesce(
            Sum(Case(When(type='expense', then=F('estimated')), default=zero, output_field=DecimalField(max_digits=14, decimal_places=2))),
            zero,
        ),
        total_actual=Coalesce(
            Sum(Case(When(type='expense', then=F('actual')), default=zero, output_field=DecimalField(max_digits=14, decimal_places=2))),
            zero,
        ),
    )

    total_estimated = totals['total_estimated'] or Decimal('0')
    total_actual = totals['total_actual'] or Decimal('0')
    variance = total_actual - total_estimated

    ratio = Decimal('0')
    if total_estimated > 0:
        ratio = (total_actual / total_estimated).quantize(Decimal('0.01'))

    new_status = 'OK'
    if total_actual > total_estimated:
        new_status = 'OVERSPENT'
    elif ratio >= WARNING_THRESHOLD:
        new_status = 'WARNING'

    with transaction.atomic():
        health, created = BudgetHealth.objects.select_for_update().get_or_create(
            event_id=event_id,
            defaults={
                'total_estimated': total_estimated,
                'total_actual': total_actual,
                'variance': variance,
                'status': new_status,
            },
        )
        previous_status = None if created else health.status
        health.total_estimated = total_estimated
        health.total_actual = total_actual
        health.variance = variance
        health.status = new_status
        health.save()

    if new_status == 'OVERSPENT' and previous_status != 'OVERSPENT':
        run_automation('budget_overrun', {
            'event_id': event_id,
            'total_actual': str(total_actual),
            'total_estimated': str(total_estimated),
            'variance': str(variance),
        })

    return health
