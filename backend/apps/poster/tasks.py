from __future__ import annotations
from __future__ import annotations

import zipfile
from io import BytesIO
from typing import List, Tuple

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import slugify

from apps.automation.utils import run_automation
from apps.timeline.models import TimelineEntry
from planora_backend.celery import app as celery_app
from .models import CertificateBatch, CertificateBatchItem, CertificateRecord
from .services.template_renderer import render_certificate_html


def _log_timeline(event_id, type_, source, payload, actor=None):
    """Write a timeline entry if an event_id is present."""
    if not event_id:
        return
    payload = payload or {}
    payload.setdefault('snapshot', {})
    TimelineEntry.objects.create(event_id=event_id, actor=actor, type=type_, source=source, payload=payload)


@celery_app.task(name='generate_certificates_batch')
def generate_certificates_batch(batch_id: str):
    """Process a certificate batch: render PDFs, create records, zip outputs."""
    try:
        batch = CertificateBatch.objects.select_related('event', 'template_version', 'created_by').get(id=batch_id)
    except CertificateBatch.DoesNotExist:
        return

    event = batch.event
    template_version = batch.template_version

    try:
        batch.status = 'RUNNING'
        batch.save(update_fields=['status'])

        pdf_files: List[Tuple[str, bytes]] = []
        success_count = 0
        failed_count = 0

        for item in batch.items.select_related('batch').all().order_by('id'):
            try:
                data = {'name': item.name, 'event': event.name}
                pdf_bytes = render_certificate_html(template_version, data)
                safe_name = slugify(item.name) or f"recipient-{item.id}"
                rel_path = f"certificates/batches/{batch.id}/{safe_name}.pdf"
                saved_path = default_storage.save(rel_path, ContentFile(pdf_bytes))
                saved_url = default_storage.url(saved_path)

                cert = CertificateRecord.objects.create(
                    event=event,
                    user=batch.created_by,
                    name=item.name,
                    file=saved_path,
                    file_url=saved_url,
                )

                item.certificate = cert
                item.status = 'SUCCESS'
                item.error_message = None
                item.save(update_fields=['certificate', 'status', 'error_message'])

                pdf_files.append((f"{safe_name}.pdf", pdf_bytes))
                success_count += 1
            except Exception as exc:  # noqa: BLE001
                item.status = 'FAILED'
                item.error_message = str(exc)
                item.save(update_fields=['status', 'error_message'])
                failed_count += 1

        zip_buffer = BytesIO()
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            for filename, content in pdf_files:
                zf.writestr(filename, content)
        zip_buffer.seek(0)
        zip_path = default_storage.save(f"certificates/batches/{batch.id}/batch.zip", ContentFile(zip_buffer.getvalue()))

        batch.success_count = success_count
        batch.failed_count = failed_count
        batch.status = 'COMPLETED'
        batch.zip_file = zip_path
        batch.completed_at = timezone.now()
        batch.save(update_fields=['success_count', 'failed_count', 'status', 'zip_file', 'completed_at'])

        payload = {'batch_id': str(batch.id), 'event_id': event.id, 'success': success_count, 'failed': failed_count}
        run_automation('certificates_generated', payload)
        _log_timeline(event.id, 'certificate_batch_completed', 'certificate', payload, actor=batch.created_by)

        return {'success': success_count, 'failed': failed_count}

    except Exception as exc:  # noqa: BLE001
        batch.status = 'FAILED'
        batch.completed_at = timezone.now()
        batch.save(update_fields=['status', 'completed_at'])
        payload = {'batch_id': str(batch.id), 'event_id': event.id, 'error': str(exc)}
        run_automation('certificates_batch_failed', payload)
        _log_timeline(event.id, 'certificate_batch_failed', 'certificate', payload, actor=batch.created_by)
        raise