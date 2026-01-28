from django.contrib.auth.models import User
from rest_framework import serializers
from .models import UserProfile
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ['role', 'last_viewed_group_id', 'last_scroll_position', 'drafts']

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(required=False)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'profile']

    def update(self, instance, validated_data):
        profile_data = validated_data.pop('profile', None)
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            for attr, val in profile_data.items():
                setattr(profile, attr, val)
            profile.save()
        return instance


class UserLiteSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email']

class RegisterSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=UserProfile.ROLE_CHOICES, default='attendee')
    password = serializers.CharField(write_only=True, min_length=8)
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name', 'role']

    def validate(self, attrs):
        # Normalize inputs
        username = (attrs.get('username') or '').strip()
        email = (attrs.get('email') or '').strip().lower()
        attrs['username'] = username
        attrs['email'] = email
        # Validate password with Django validators but return DRF-style errors
        password = attrs.get('password')
        # Provide a lightweight user instance to validators that check user similarity
        tmp_user = User(username=username, email=email)
        try:
            validate_password(password, user=tmp_user)
        except DjangoValidationError as e:
            # Map to field error for "password"
            raise serializers.ValidationError({'password': list(e.messages)})
        return attrs

    def validate_username(self, value):
        value = (value or '').strip()
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Username already taken')
        return value

    def validate_email(self, value):
        # Email not unique by default in Django, but we enforce it for app logic
        value = (value or '').strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Email already registered')
        return value

    def create(self, validated_data):
        role = validated_data.pop('role', 'attendee')
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        UserProfile.objects.update_or_create(user=user, defaults={'role': role})
        return user
