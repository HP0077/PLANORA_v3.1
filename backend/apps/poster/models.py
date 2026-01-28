from django.db import models
from django.contrib.auth.models import User
from apps.events.models import Event
from apps.chats.models import ChatRoom
from django.utils import timezone
from django.db.models import Max
import uuid

class Template(models.Model):
    name = models.CharField(max_length=120)
    json = models.JSONField(default=dict)
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)

class CertificateRecord(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, null=True, blank=True, related_name='certificate_records')
    name = models.CharField(max_length=200)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    file_url = models.URLField(blank=True)
    file = models.FileField(upload_to='certificates/', null=True, blank=True)

class PosterDraft(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='poster_drafts')
    event = models.ForeignKey(Event, on_delete=models.SET_NULL, null=True, blank=True, related_name='poster_drafts')
    room = models.ForeignKey(ChatRoom, on_delete=models.SET_NULL, null=True, blank=True, related_name='poster_drafts')
    name = models.CharField(max_length=200, default='Untitled')
    state = models.JSONField(default=dict, blank=True)
    locked_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='locked_drafts')
    locked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.name} ({self.owner.username})"


class CertificateTemplate(models.Model):
    """Template container for certificate rendering (v2)."""

    name = models.CharField(max_length=200)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, null=True, blank=True, related_name='certificate_templates')
    is_default = models.BooleanField(default=False)
    active_version = models.ForeignKey('CertificateTemplateVersion', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_certificate_templates')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=['event', 'is_default'])]

    def __str__(self):
        scope = self.event_id or 'global'
        return f"CertificateTemplate[{self.id}] {self.name} ({scope})"


class CertificateTemplateVersion(models.Model):
    """Versioned HTML/CSS for a certificate template."""

    template = models.ForeignKey(CertificateTemplate, on_delete=models.CASCADE, related_name='versions')
    version = models.PositiveIntegerField(default=1)
    html = models.TextField()
    css = models.TextField()
    assets = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_published = models.BooleanField(default=False)

    class Meta:
        unique_together = [('template', 'version')]
        ordering = ['template_id', '-version']

    def save(self, *args, **kwargs):
        # Auto-increment version per template on creation
        if self.pk is None:
            max_ver = self.template.versions.aggregate(m=Max('version')).get('m') or 0
            self.version = (max_ver or 0) + 1
        super().save(*args, **kwargs)

    def __str__(self):
        return f"TemplateVersion[{self.template_id}] v{self.version}"


class CertificateBatch(models.Model):
    """Represents an async batch certificate generation job."""

    STATUS_CHOICES = (
        ('QUEUED', 'Queued'),
        ('RUNNING', 'Running'),
        ('COMPLETED', 'Completed'),
        ('FAILED', 'Failed'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name='certificate_batches')
    template_version = models.ForeignKey(CertificateTemplateVersion, on_delete=models.PROTECT, related_name='batches')
    total_count = models.PositiveIntegerField(default=0)
    success_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='QUEUED')
    zip_file = models.FileField(upload_to='certificates/batches/', null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_certificate_batches')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"CertificateBatch[{self.id}] {self.status}"


class CertificateBatchItem(models.Model):
    """Individual recipient entry inside a certificate batch."""

    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('SUCCESS', 'Success'),
        ('FAILED', 'Failed'),
    )

    batch = models.ForeignKey(CertificateBatch, on_delete=models.CASCADE, related_name='items')
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    error_message = models.TextField(null=True, blank=True)
    certificate = models.ForeignKey(CertificateRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='batch_items')

    def __str__(self):
        return f"BatchItem[{self.id}] {self.name} ({self.status})"
