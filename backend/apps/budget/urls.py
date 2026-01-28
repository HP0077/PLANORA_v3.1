from rest_framework.routers import DefaultRouter
from .views import BudgetItemViewSet

router = DefaultRouter()
router.register(r'', BudgetItemViewSet, basename='budget')

urlpatterns = router.urls
