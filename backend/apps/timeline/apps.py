from django.apps import AppConfig


class TimelineConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.timeline'

    def ready(self):
        from . import signals  # noqa: F401
