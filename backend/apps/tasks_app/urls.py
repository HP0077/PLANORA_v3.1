from rest_framework.routers import DefaultRouter
from .views import TaskViewSet, GroupViewSet

router = DefaultRouter()
router.register(r'groups', GroupViewSet, basename='group')
router.register(r'', TaskViewSet, basename='task')

urlpatterns = router.urls
