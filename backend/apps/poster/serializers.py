from urllib.parse import urlparse
from rest_framework import serializers
from .models import (
    CertificateRecord,
    CertificateTemplate,
    CertificateTemplateVersion,
    CertificateBatch,
)


class CertificateRecordSerializer(serializers.ModelSerializer):
    """Serializes issued certificate records with download URLs."""

    event_name = serializers.SerializerMethodField(read_only=True)
    status = serializers.SerializerMethodField(read_only=True)
    meta = serializers.SerializerMethodField(read_only=True)
    source_filename = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = CertificateRecord
        fields = [
            'id', 'event', 'name', 'user', 'issued_at', 'file_url', 'file',
            'event_name', 'status', 'meta', 'source_filename'
        ]
        read_only_fields = ['id', 'issued_at', 'file_url', 'file', 'event_name', 'status', 'meta', 'source_filename']

    def get_event_name(self, obj):
        ev = getattr(obj, 'event', None)
        return getattr(ev, 'name', '') or ''

    def get_status(self, obj):
        return 'ISSUED'

    def get_meta(self, obj):
        return {'generated': True}

    def get_source_filename(self, obj):
        url = obj.file_url or ''
        try:
            path = urlparse(url).path
            if path:
                return path.rstrip('/').split('/')[-1]
        except Exception:
            pass
        return ''


class CertificateTemplateVersionSerializer(serializers.ModelSerializer):
    """Public serializer for template versions."""

    class Meta:
        model = CertificateTemplateVersion
        fields = ['id', 'version', 'html', 'css', 'assets', 'is_published', 'created_at']
        read_only_fields = ['id', 'version', 'assets', 'is_published', 'created_at']


class CertificateTemplateSerializer(serializers.ModelSerializer):
    """Serializer for CertificateTemplate with active version info."""

    active_version = CertificateTemplateVersionSerializer(read_only=True)

    class Meta:
        model = CertificateTemplate
        fields = ['id', 'name', 'event', 'is_default', 'active_version', 'created_by', 'created_at']
        read_only_fields = ['id', 'active_version', 'created_by', 'created_at']


class CertificateTemplateCreateSerializer(serializers.Serializer):
    """Serializer for creating templates or new versions with file uploads."""

    name = serializers.CharField(max_length=200)
    event_id = serializers.IntegerField(required=False, allow_null=True)
    html = serializers.CharField()
    css = serializers.CharField(required=False, allow_blank=True, default='')
    is_default = serializers.BooleanField(required=False, default=False)
    template_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        event_id = attrs.get('event_id')
        template_id = attrs.get('template_id')

        if template_id:
            try:
                template = CertificateTemplate.objects.get(id=template_id)
            except CertificateTemplate.DoesNotExist:
                raise serializers.ValidationError({'template_id': 'Template not found'})
            # Permissions for updating/adding version
            if template.event_id:
                if not template.event.owner_id == getattr(user, 'id', None):
                    raise serializers.ValidationError({'permission': 'Only event owner can update template'})
            else:
                if not getattr(user, 'is_staff', False):
                    raise serializers.ValidationError({'permission': 'Only admins can update global templates'})
            attrs['template'] = template
            return attrs

        # Creating new template
        if event_id:
            from apps.events.models import Event
            try:
                event = Event.objects.get(id=event_id)
            except Event.DoesNotExist:
                raise serializers.ValidationError({'event_id': 'Event not found'})
            if not event.owner_id == getattr(user, 'id', None):
                raise serializers.ValidationError({'permission': 'Only event owner can create templates'})
            attrs['event'] = event
        else:
            if not getattr(user, 'is_staff', False):
                raise serializers.ValidationError({'permission': 'Only admins can create global templates'})
            attrs['event'] = None
        return attrs


class CertificateBatchSerializer(serializers.ModelSerializer):
    """Serializer for CertificateBatch status/progress."""

    zip_file_url = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = CertificateBatch
        fields = [
            'id', 'event', 'template_version', 'total_count', 'success_count', 'failed_count',
            'status', 'zip_file', 'zip_file_url', 'created_by', 'created_at', 'completed_at', 'progress'
        ]
        read_only_fields = fields

    def get_zip_file_url(self, obj):
        try:
            if obj.zip_file:
                return obj.zip_file.url
        except Exception:
            return None
        return None

    def get_progress(self, obj):
        return {'success': obj.success_count, 'failed': obj.failed_count, 'total': obj.total_count}


class CertificateBatchSubmitSerializer(serializers.Serializer):
    """Validate batch submission input."""

    event_id = serializers.IntegerField()
    template_version_id = serializers.IntegerField()

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        from apps.events.models import Event
        try:
            event = Event.objects.get(id=attrs['event_id'])
        except Event.DoesNotExist:
            raise serializers.ValidationError({'event_id': 'event not found'})
        if event.owner_id != getattr(user, 'id', None):
            raise serializers.ValidationError({'permission': 'Only the event owner can submit batches'})
        if (getattr(event, 'status', 'DRAFT') or 'DRAFT').upper() != 'LIVE':
            raise serializers.ValidationError({'event': 'Event must be LIVE to generate certificates'})

        try:
            template_version = CertificateTemplateVersion.objects.select_related('template').get(id=attrs['template_version_id'])
        except CertificateTemplateVersion.DoesNotExist:
            raise serializers.ValidationError({'template_version_id': 'template version not found'})

        template = template_version.template
        if template.event_id and template.event_id != event.id:
            raise serializers.ValidationError({'template_version_id': 'template does not belong to this event'})
        # Allow global templates to be used by any authenticated user
        attrs['event'] = event
        attrs['template_version'] = template_version
        return attrs
