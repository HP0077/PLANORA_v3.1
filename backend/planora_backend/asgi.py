import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'planora_backend.settings')

django_asgi_app = get_asgi_application()

patterns = []
try:
    from apps.chats.routing import websocket_urlpatterns as chat_ws
    patterns += chat_ws
except Exception:
    pass
try:
    from apps.poster.routing import websocket_urlpatterns as poster_ws
    patterns += poster_ws
except Exception:
    pass
try:
    from apps.tasks_app.routing import websocket_urlpatterns as tasks_ws
    patterns += tasks_ws
except Exception:
    pass

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': AuthMiddlewareStack(URLRouter(patterns)),
})
