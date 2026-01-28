from django.contrib.auth.models import User
from django.db.models import Q
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.throttling import ScopedRateThrottle

from .serializers import RegisterSerializer, UserSerializer, UserLiteSerializer

class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        identifier = (attrs.get('username') or '').strip()
        if identifier:
            if '@' in identifier:
                # Login by email (case-insensitive)
                try:
                    user = User.objects.get(email__iexact=identifier)
                    attrs['username'] = user.username
                except User.DoesNotExist:
                    # Fall through to default validation
                    attrs['username'] = identifier
            else:
                # Case-insensitive username lookup
                try:
                    user = User.objects.get(username__iexact=identifier)
                    attrs['username'] = user.username
                except User.DoesNotExist:
                    attrs['username'] = identifier
        return super().validate(attrs)

class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

@api_view(['GET','PUT'])
@permission_classes([permissions.IsAuthenticated])
def me(request):
    if request.method == 'GET':
        return Response(UserSerializer(request.user).data)
    # PUT
    serializer = UserSerializer(instance=request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def search_users(request):
    q = (request.GET.get('q') or '').strip()
    if not q:
        return Response({'results': []})
    users = User.objects.filter(
        Q(username__icontains=q) | Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
    ).order_by('username')[:20]
    return Response({'results': UserLiteSerializer(users, many=True).data})
