import logging

from rest_framework import viewsets, permissions
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.decorators import action
from django.http import FileResponse, Http404
from django.db.models import Q
from .models import FileAsset
from .serializers import FileAssetSerializer

logger = logging.getLogger(__name__)


class FileAssetViewSet(viewsets.ModelViewSet):
    serializer_class = FileAssetSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def retrieve(self, request, *args, **kwargs):
        # Use default retrieve with queryset permissions
        return super().retrieve(request, *args, **kwargs)

    def get_queryset(self):
        u = self.request.user
        qs = FileAsset.objects.select_related('room__event', 'uploaded_by').filter(
            Q(room__event__owner=u) | Q(room__memberships__user=u)
        ).distinct()
        room_id = self.request.query_params.get('room')
        if room_id:
            qs = qs.filter(room_id=room_id)
        type_filter = (self.request.query_params.get('type') or '').lower()
        if type_filter == 'image':
            qs = qs.filter(mime__startswith='image/')
        elif type_filter == 'doc':
            qs = qs.exclude(mime__startswith='image/')
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        room = serializer.validated_data.get('room')
        if not room:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'room': ['This field is required.']})
        u = self.request.user
        if not (room.event.owner_id == u.id or room.memberships.filter(user=u).exists()):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Forbidden')
        file = self.request.FILES.get('file')
        mime = file.content_type if file else ''
        size = file.size if file else 0
        serializer.save(uploaded_by=u, mime=mime, size=size)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        asset = self.get_object()
        # permissions already enforced by get_object via queryset
        try:
            fh = asset.file.open('rb')
            response = FileResponse(fh, as_attachment=True, content_type=asset.mime or 'application/octet-stream')
            # Force a clean filename in the Content-Disposition header
            import os
            filename = os.path.basename(asset.file.name)
            response["Content-Disposition"] = f'attachment; filename="{filename}"'
            return response
        except Exception:
            logger.exception("File download failed asset=%s", pk)
            raise Http404()
