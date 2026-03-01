from django.urls import path
from .views import (
    AskView,
    GenerateDescriptionView,
    SuggestTasksView,
    EventSummaryView,
    RiskMitigationView,
    DraftEmailView,
)

urlpatterns = [
    path('ask/', AskView.as_view(), name='ai-ask'),
    path('generate-description/', GenerateDescriptionView.as_view(), name='ai-generate-description'),
    path('suggest-tasks/', SuggestTasksView.as_view(), name='ai-suggest-tasks'),
    path('event-summary/', EventSummaryView.as_view(), name='ai-event-summary'),
    path('risk-mitigation/', RiskMitigationView.as_view(), name='ai-risk-mitigation'),
    path('draft-email/', DraftEmailView.as_view(), name='ai-draft-email'),
]
