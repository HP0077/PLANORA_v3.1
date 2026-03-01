import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'planora_backend.settings')

app = Celery('planora')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'recompute-event-intelligence-every-5-min': {
        'task': 'apps.event_intelligence.tasks.recompute_all_profiles',
        'schedule': crontab(minute='*/5'),
    },
    'send-pending-notifications-every-minute': {
        'task': 'apps.notifications.tasks.send_pending_notifications',
        'schedule': crontab(minute='*/1'),
    },
}
app.conf.timezone = 'UTC'
