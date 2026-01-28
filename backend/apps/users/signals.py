from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db.utils import OperationalError, ProgrammingError
from .models import UserProfile

@receiver(post_save, sender=User)
def create_profile(sender, instance, created, **kwargs):
    if created:
        try:
            UserProfile.objects.get_or_create(user=instance)
        except (OperationalError, ProgrammingError):
            # Tables not ready yet (first migrate). Safe to ignore; profile
            # will be created by RegisterSerializer or on next save.
            pass
