try:
	from .celery import app as celery_app  # noqa: F401
except Exception:  # pragma: no cover - during editor bootstrap
	celery_app = None

__all__ = ("celery_app",)
