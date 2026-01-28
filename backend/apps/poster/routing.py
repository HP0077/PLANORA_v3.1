from django.urls import re_path
from .consumers import PosterDraftConsumer

websocket_urlpatterns = [
    re_path(r"ws/poster/(?P<draft_id>\d+)/$", PosterDraftConsumer.as_asgi()),
]
