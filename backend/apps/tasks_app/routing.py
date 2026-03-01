from django.urls import re_path
from .consumers import TaskConsumer

websocket_urlpatterns = [
    re_path(r"ws/tasks/(?P<event_id>\d+)/$", TaskConsumer.as_asgi()),
]
