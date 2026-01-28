from rest_framework.routers import DefaultRouter
from .views import RuleViewSet

router = DefaultRouter()
router.register(r'rules', RuleViewSet, basename='automation-rule')

urlpatterns = router.urls
