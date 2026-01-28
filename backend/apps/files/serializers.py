from rest_framework import serializers
from .models import FileAsset
import os

class FileAssetSerializer(serializers.ModelSerializer):
    filename = serializers.SerializerMethodField()
    class Meta:
        model = FileAsset
        fields = ['id', 'room', 'file', 'mime', 'size', 'created_at', 'filename']
        read_only_fields = ['id', 'created_at', 'filename']

    def get_filename(self, obj: FileAsset):
        try:
            return os.path.basename(obj.file.name)
        except Exception:
            return None
