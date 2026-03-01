from django.db import models
from django.contrib.auth.models import User
from apps.chats.models import ChatRoom


def upload_path(instance, filename):
    return f"rooms/{instance.room_id}/{filename}"


class FileAsset(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='files')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='uploaded_files')
    file = models.FileField(upload_to=upload_path)
    mime = models.CharField(max_length=255, blank=True)
    size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['room', '-created_at']),
        ]

    def __str__(self):
        return f"{self.file.name} ({self.room_id})"
