from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.db import models
from .models import Rule
from .serializers import RuleSerializer
from .permissions import IsRuleOwnerOrEventOwner


class RuleViewSet(viewsets.ModelViewSet):
    serializer_class = RuleSerializer
    permission_classes = [IsAuthenticated, IsRuleOwnerOrEventOwner]

    def get_queryset(self):
        user = self.request.user
        qs = Rule.objects.all()
        # Visible to rule owner or event owner
        return qs.filter(
            models.Q(created_by=user) |
            models.Q(event__owner=user) |
            models.Q(event__isnull=True, created_by=user)
        ).select_related('event', 'created_by')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save()
