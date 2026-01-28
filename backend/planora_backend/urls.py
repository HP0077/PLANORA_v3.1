from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.timeline.views import EventTimelineViewSet

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('apps.users.urls')),
    path('api/events/', include('apps.events.urls')),
    path('api/events/<int:event_id>/timeline/', EventTimelineViewSet.as_view({'get': 'list'}), name='event-timeline'),
    path('api/tasks/', include('apps.tasks_app.urls')),
    path('api/chats/', include('apps.chats.urls')),
    path('api/poster/', include('apps.poster.urls')),
    path('api/budget/', include('apps.budget.urls')),
    path('api/analytics/', include('apps.analytics.urls')),
    # files endpoints live under api/files/ to avoid shadowing other api routes
    path('api/files/', include('apps.files.urls')),
    path('api/automation/', include('apps.automation_rules.urls')),
    path('api/timeline/', include('apps.timeline.urls')),
    path('api/ai/', include('apps.ai_assistant.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
