from rest_framework import viewsets, permissions
import logging
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q, Sum, Case, When, DecimalField, F, Value, Count
from django.db.models.functions import Coalesce
from .models import BudgetItem
from .serializers import BudgetItemSerializer
from apps.automation.utils import run_automation
from .services import recalc_budget_health

logger = logging.getLogger(__name__)

class BudgetItemViewSet(viewsets.ModelViewSet):
    serializer_class = BudgetItemSerializer
    permission_classes = [permissions.IsAuthenticated]

    LOCKED_STATUSES = {'COMPLETED', 'ARCHIVED'}

    def _ensure_event_mutable(self, event):
        """Prevent mutations once the event is completed or archived."""
        status = (getattr(event, 'status', 'DRAFT') or 'DRAFT').upper()
        if status in self.LOCKED_STATUSES:
            raise PermissionDenied('Budget is locked for completed or archived events')

    def get_queryset(self):
        u = self.request.user
        qs = (
            BudgetItem.objects
            .select_related('event')
            .filter(Q(event__owner=u) | Q(room__memberships__user=u))
            .distinct()
            .order_by('-created_at')
        )

        params = self.request.query_params
        event_id = params.get('event') or params.get('event_id')
        room_id = params.get('room') or params.get('room_id')
        if event_id:
            qs = qs.filter(event_id=event_id)
        if room_id:
            qs = qs.filter(room_id=room_id)
        return qs

    def perform_create(self, serializer):
        event = serializer.validated_data.get('event')
        if not event or event.owner_id != self.request.user.id:
            raise PermissionDenied('You cannot create a budget item for this event')
        self._ensure_event_mutable(event)
        instance = serializer.save()
        run_automation('budget.item.created', {'event_id': event.id, 'budget_item_id': instance.id, 'type': instance.type})
        self._safe_recalc(event.id)

    def perform_update(self, serializer):
        event = serializer.validated_data.get('event') or serializer.instance.event
        if event.owner_id != self.request.user.id:
            raise PermissionDenied('You cannot modify a budget item for this event')
        self._ensure_event_mutable(event)
        instance = serializer.save()
        run_automation('budget.item.updated', {'event_id': event.id, 'budget_item_id': instance.id, 'type': instance.type})
        self._safe_recalc(event.id)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.event.owner_id != request.user.id:
            raise PermissionDenied('You cannot delete a budget item for this event')
        self._ensure_event_mutable(instance.event)
        run_automation('budget.item.deleted', {'event_id': instance.event_id, 'budget_item_id': instance.id})
        response = super().destroy(request, *args, **kwargs)
        self._safe_recalc(instance.event_id)
        return response

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        event_id = request.query_params.get('event')
        room_id = request.query_params.get('room')
        qs = self.get_queryset()
        if event_id:
            qs = qs.filter(event_id=event_id)
        if room_id:
            qs = qs.filter(room_id=room_id)
        # Simple CSV
        lines = ["type,title,estimated,actual"]
        for it in qs:
            lines.append(f"{it.type},{it.title},{it.estimated},{it.actual}")
        return Response("\n".join(lines), content_type='text/csv')

    @action(detail=False, methods=['get'])
    def export_pdf(self, request):
        # Minimal PDF stub
        from django.http import HttpResponse
        from reportlab.pdfgen import canvas
        from io import BytesIO
        buffer = BytesIO()
        p = canvas.Canvas(buffer)
        p.setFont('Helvetica-Bold', 16)
        p.drawString(72, 800, 'Budget Report')
        p.showPage()
        p.save()
        buffer.seek(0)
        resp = HttpResponse(buffer.getvalue(), content_type='application/pdf')
        resp['Cache-Control'] = 'no-store'
        return resp

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Aggregate income/expense totals per event for dashboards."""
        event_id = request.query_params.get('event') or request.query_params.get('event_id')
        # Rebuild a clean queryset without ordering/distinct side effects so aggregation groups per event
        base_ids = self.get_queryset().values_list('id', flat=True)
        qs = BudgetItem.objects.filter(id__in=base_ids).order_by()
        if event_id:
            qs = qs.filter(event_id=event_id)

        dec_field = DecimalField(max_digits=14, decimal_places=2)
        zero_dec = Value(0, output_field=dec_field)

        aggregates = qs.values('event_id', 'event__name', 'event__status').annotate(
            estimated_income=Coalesce(
                Sum(Case(When(type='income', then=F('estimated')), default=zero_dec, output_field=dec_field)),
                zero_dec,
                output_field=dec_field,
            ),
            estimated_expense=Coalesce(
                Sum(Case(When(type='expense', then=F('estimated')), default=zero_dec, output_field=dec_field)),
                zero_dec,
                output_field=dec_field,
            ),
            actual_income=Coalesce(
                Sum(Case(When(type='income', then=F('actual')), default=zero_dec, output_field=dec_field)),
                zero_dec,
                output_field=dec_field,
            ),
            actual_expense=Coalesce(
                Sum(Case(When(type='expense', then=F('actual')), default=zero_dec, output_field=dec_field)),
                zero_dec,
                output_field=dec_field,
            ),
            item_count=Coalesce(Count('id'), Value(0)),
        )

        event_ids = [row['event_id'] for row in aggregates]
        health_map = {bh.event_id: bh for bh in self._get_health(event_ids)}

        data = []
        for row in aggregates:
            net_estimated = row['estimated_income'] - row['estimated_expense']
            net_actual = row['actual_income'] - row['actual_expense']
            health = health_map.get(row['event_id']) or self._safe_recalc(row['event_id'])
            data.append({
                'event_id': row['event_id'],
                'event_name': row['event__name'],
                'event_status': row['event__status'] or 'DRAFT',
                'estimated_income': row['estimated_income'],
                'estimated_expense': row['estimated_expense'],
                'actual_income': row['actual_income'],
                'actual_expense': row['actual_expense'],
                'net_estimated': net_estimated,
                'net_actual': net_actual,
                'item_count': row['item_count'],
                'total_estimated': health.total_estimated,
                'total_actual': health.total_actual,
                'variance': health.variance,
                'health_status': health.status,
            })

        return Response(data)

    def _get_health(self, event_ids):
        from .models import BudgetHealth
        return BudgetHealth.objects.filter(event_id__in=event_ids)

    def _safe_recalc(self, event_id):
        try:
            return recalc_budget_health(event_id)
        except Exception as exc:
            logger.exception("budget.health.recalc_failed event_id=%s", event_id)
            return None
