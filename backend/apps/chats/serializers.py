from rest_framework import serializers
from django.contrib.auth.models import User
from apps.users.serializers import UserProfileSerializer
from .models import ChatRoom, ChatMembership, Message, MessageRead

class UserLiteSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'role']

    def get_role(self, obj):
        try:
            return obj.profile.role
        except Exception:
            return None

class ChatRoomSerializer(serializers.ModelSerializer):
    members = UserLiteSerializer(many=True, read_only=True)

    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'event', 'created_by', 'members']
        read_only_fields = ['id', 'created_by', 'members']

    def create(self, validated_data):
        request = self.context['request']
        room = ChatRoom.objects.create(created_by=request.user, **validated_data)
        if request.user:
            ChatMembership.objects.get_or_create(room=room, user=request.user)
        return room

class ChatMembershipSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMembership
        fields = ['id', 'room', 'user', 'joined_at']
        read_only_fields = ['id', 'joined_at']

class MessageSerializer(serializers.ModelSerializer):
    sender = UserLiteSerializer(read_only=True)
    read_by = serializers.SerializerMethodField()
    content = serializers.CharField(allow_blank=True, required=False)

    class Meta:
        model = Message
        fields = ['id', 'room', 'sender', 'content', 'attachments', 'edited_flag', 'created_at', 'read_by']
        read_only_fields = ['id', 'sender', 'created_at', 'read_by']

    def get_read_by(self, obj):
        return list(obj.reads.values_list('user_id', flat=True))

    def validate(self, attrs):
        content = attrs.get('content') or ''
        attachments = attrs.get('attachments') or []
        if not content.strip() and not attachments:
            raise serializers.ValidationError({'non_field_errors': ['Message must have text or at least one attachment.']})
        return attrs