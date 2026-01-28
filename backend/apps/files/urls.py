from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FileAssetViewSet

router = DefaultRouter()
# Expose the viewset at /api/files/ instead of /api/files/files/
router.register(r'', FileAssetViewSet, basename='file-asset')

urlpatterns = [
    path('', include(router.urls)),
]
