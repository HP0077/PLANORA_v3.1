"""Analytics API — real aggregations across events, tasks, and budget."""
from __future__ import annotations

from django.db.models import Count, Q, Sum, Avg, Max, Min, DecimalField
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.events.models import Event
from apps.tasks_app.models import Task
from apps.budget.models import BudgetItem, BudgetHealth


class AnalyticsSummaryView(APIView):
    """Aggregated dashboard analytics for the authenticated user's events.

    Query params
    ------------
    event_id : int (optional)
        When provided, scopes every metric to that single event.
        Omit for an "All Events" overview.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        all_events = Event.objects.filter(
            Q(owner=user) | Q(participants=user)
        ).distinct()

        # ── Build event list for the frontend filter dropdown ──
        event_list = list(
            all_events.order_by('-date')
            .values('id', 'name', 'status', 'date', 'mode')
        )
        for evt in event_list:
            evt['date'] = evt['date'].isoformat() if evt['date'] else None

        # ── Optional per-event scoping ──
        event_id = request.query_params.get('event_id')
        if event_id:
            events = all_events.filter(id=event_id)
        else:
            events = all_events

        event_ids = list(events.values_list('id', flat=True))

        # ── Event breakdown by status ──
        event_by_status = dict(
            events.values_list('status')
            .annotate(c=Count('id'))
            .values_list('status', 'c')
        )

        # ── Event date info (for single-event view) ──
        event_meta = {}
        if event_id and events.exists():
            evt = events.first()
            event_meta = {
                'name': evt.name,
                'status': evt.status,
                'date': evt.date.isoformat() if evt.date else None,
                'mode': evt.mode,
                'description': evt.description or '',
            }

        # ── Task stats ──
        tasks = Task.objects.filter(event_id__in=event_ids)
        today = timezone.localdate()
        task_by_status = dict(
            tasks.values_list('status')
            .annotate(c=Count('id'))
            .values_list('status', 'c')
        )
        task_by_priority = dict(
            tasks.values_list('priority')
            .annotate(c=Count('id'))
            .values_list('priority', 'c')
        )
        overdue = tasks.filter(
            due_date__lt=today, status__in=['pending', 'in_progress']
        ).count()
        total_tasks = sum(task_by_status.values())
        done_tasks = task_by_status.get('done', 0)
        completion_pct = round(done_tasks / total_tasks * 100, 1) if total_tasks else 0

        # ── Task completion over time (last 30 days) ──
        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
        completion_trend = list(
            tasks.filter(status='done', completed_at__gte=thirty_days_ago)
            .annotate(day=TruncDate('completed_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
            .values('day', 'count')
        )
        for entry in completion_trend:
            entry['day'] = entry['day'].isoformat() if entry['day'] else None

        # ── Budget burn ──
        budget_items = BudgetItem.objects.filter(event_id__in=event_ids)

        # Separate expense and income aggregations
        expense_agg = budget_items.filter(type='expense').aggregate(
            est=Sum('estimated', output_field=DecimalField()),
            act=Sum('actual', output_field=DecimalField()),
        )
        income_agg = budget_items.filter(type='income').aggregate(
            est=Sum('estimated', output_field=DecimalField()),
            act=Sum('actual', output_field=DecimalField()),
        )
        expense_estimated = float(expense_agg['est'] or 0)
        expense_actual = float(expense_agg['act'] or 0)
        income_estimated = float(income_agg['est'] or 0)
        income_actual = float(income_agg['act'] or 0)

        # "Total spend" = expenses only; variance = actual_expense - estimated_expense
        total_estimated = expense_estimated
        total_actual = expense_actual
        variance = total_actual - total_estimated
        utilisation_pct = round(total_actual / total_estimated * 100, 1) if total_estimated else 0

        # Net = income - expenses
        net_estimated = income_estimated - expense_estimated
        net_actual = income_actual - expense_actual

        budget_by_event = list(
            BudgetHealth.objects.filter(event_id__in=event_ids)
            .select_related('event')
            .values(
                'event_id', 'event__name', 'status',
                'total_estimated', 'total_actual', 'variance',
            )
        )

        # ── Participation count ──
        participation = events.annotate(
            participant_count=Count('participants', distinct=True)
        ).aggregate(
            total_participants=Sum('participant_count'),
        )

        return Response({
            # dropdown data
            'event_list': event_list,
            'selected_event': event_meta or None,

            # headline numbers
            'total_events': len(event_ids),
            'event_by_status': event_by_status,
            'total_tasks': total_tasks,
            'task_by_status': task_by_status,
            'task_by_priority': task_by_priority,
            'overdue_tasks': overdue,
            'completion_pct': completion_pct,
            'completion_trend': completion_trend,

            # budget
            'budget': {
                'total_estimated': total_estimated,   # expenses only
                'total_actual': total_actual,          # expenses only
                'variance': variance,
                'utilisation_pct': utilisation_pct,
                'income_estimated': income_estimated,
                'income_actual': income_actual,
                'net_estimated': net_estimated,
                'net_actual': net_actual,
                'by_type': {
                    'expense': expense_actual,
                    'income': income_actual,
                },
                'by_event': budget_by_event,
            },
            'total_participants': participation['total_participants'] or 0,
        })
