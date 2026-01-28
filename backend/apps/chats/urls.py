from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatRoomViewSet, MessageViewSet, search_users

router = DefaultRouter()
router.register(r'rooms', ChatRoomViewSet, basename='chat-room')
router.register(r'messages', MessageViewSet, basename='chat-message')

urlpatterns = [
    path('', include(router.urls)),
    path('search/', search_users),
]
