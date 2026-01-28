from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from apps.users.models import UserProfile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from django.conf import settings


class Command(BaseCommand):
    help = 'Run an end-to-end smoke test of the API (auth, events, rooms, members, messages, files, tasks, budget, me)'

    def handle(self, *args, **options):
        # Ensure the Django test client default host is allowed
        try:
            allowed = list(settings.ALLOWED_HOSTS)
        except Exception:
            allowed = []
        if 'testserver' not in allowed:
            allowed.append('testserver')
            settings.ALLOWED_HOSTS = allowed

        client = APIClient()

        # Seed demo users
        pm, _ = User.objects.get_or_create(username='demo_pm', defaults={'email': 'demo_pm@example.com', 'first_name': 'Demo', 'last_name': 'PM'})
        pm.set_password('DemoPass123!')
        pm.save()
        UserProfile.objects.update_or_create(user=pm, defaults={'role': 'manager'})

        att, _ = User.objects.get_or_create(username='demo_att', defaults={'email': 'demo_att@example.com', 'first_name': 'Demo', 'last_name': 'Att'})
        att.set_password('DemoPass123!')
        att.save()
        UserProfile.objects.update_or_create(user=att, defaults={'role': 'attendee'})

        # Login (JWT)
        r = client.post('/api/users/token/', {'username': 'demo_pm', 'password': 'DemoPass123!'}, format='json')
        assert r.status_code == 200, f"token failed: {r.status_code} {r.content}"
        access = r.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')

        # Create event
        today = timezone.now().date().isoformat()
        r = client.post('/api/events/', {
            'name': 'Smoke Event', 'description': 'auto',
            'date': today, 'time': '10:00:00', 'mode': 'offline'
        }, format='json')
        assert r.status_code == 201, f"event create failed: {r.status_code} {r.content}"
        event_id = r.data['id']

        # Create room
        r = client.post('/api/chats/rooms/', {'name': 'Smoke Room', 'event': event_id}, format='json')
        assert r.status_code == 201, f"room create failed: {r.status_code} {r.content}"
        room_id = r.data['id']

        # Add member (att)
        r = client.post(f'/api/chats/rooms/{room_id}/add_member/', {'user_id': att.id}, format='json')
        assert r.status_code in (200, 201), f"add member failed: {r.status_code} {r.content}"

        # User search
        r = client.get('/api/users/search/?q=att')
        assert r.status_code == 200 and len(r.data.get('results', [])) >= 1, "user search failed"

        # Create message
        r = client.post('/api/chats/messages/', {'room': room_id, 'content': 'Hello from smoke test'}, format='json')
        assert r.status_code == 201, f"message create failed: {r.status_code} {r.content}"

        # Upload file and link via another message with attachments
        file_content = b'hello file'
        up = SimpleUploadedFile('hello.txt', file_content, content_type='text/plain')
        r = client.post('/api/files/', {'room': room_id, 'file': up}, format='multipart')
        assert r.status_code in (200, 201), f"file upload failed: {r.status_code} {r.content}"
        asset = r.data
        r = client.post('/api/chats/messages/', {'room': room_id, 'content': 'file attached', 'attachments': [asset['id']]}, format='json')
        assert r.status_code == 201, f"message with attachment failed: {r.status_code} {r.content}"

        # Create task and budget item
        r = client.post('/api/tasks/', {'title': 'Smoke Task', 'event': event_id, 'room': room_id, 'assignee': att.id}, format='json')
        assert r.status_code == 201, f"task create failed: {r.status_code} {r.content}"
        r = client.post('/api/budget/', {'title': 'Venue', 'type': 'expense', 'estimated': '100.00', 'actual': '0', 'event': event_id, 'room': room_id}, format='json')
        assert r.status_code == 201, f"budget create failed: {r.status_code} {r.content}"

        # Persist UX state
        r = client.put('/api/users/me/', {'profile': {'last_viewed_group_id': room_id, 'last_scroll_position': 200}}, format='json')
        assert r.status_code == 200, f"me update failed: {r.status_code} {r.content}"

        # List messages
        r = client.get(f'/api/chats/messages/?room={room_id}')
        assert r.status_code == 200 and len(r.data) >= 2, "messages list failed"
        # Extended chat validations
        # Create outsider user (not a member and not owner)
        outsider, _ = User.objects.get_or_create(username='demo_outsider', defaults={'email': 'demo_out@example.com'})
        outsider.set_password('DemoPass123!')
        outsider.save()
        UserProfile.objects.update_or_create(user=outsider, defaults={'role': 'attendee'})

        # Rooms scoping
        # PM should see the room
        r = client.get('/api/chats/rooms/')
        assert r.status_code == 200, 'pm rooms list failed'
        pm_rooms = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert any(x['id'] == room_id for x in pm_rooms), 'pm cannot see its room'

        # Attendee should see the room
        r = client.post('/api/users/token/', {'username': 'demo_att', 'password': 'DemoPass123!'}, format='json')
        assert r.status_code == 200, f"att token failed: {r.status_code} {r.content}"
        att_access = r.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {att_access}')
        r = client.get('/api/chats/rooms/')
        assert r.status_code == 200, 'att rooms list failed'
        att_rooms = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert any(x['id'] == room_id for x in att_rooms), 'att cannot see the room'

        # Attendee cannot add member
        r = client.post(f'/api/chats/rooms/{room_id}/add_member/', {'user_id': outsider.id}, format='json')
        assert r.status_code in (403, 401), f"att illegally added member: {r.status_code} {r.content}"

        # Outsider cannot see rooms of others
        r = client.post('/api/users/token/', {'username': 'demo_outsider', 'password': 'DemoPass123!'}, format='json')
        assert r.status_code == 200, f"outsider token failed: {r.status_code} {r.content}"
        out_access = r.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {out_access}')
        r = client.get('/api/chats/rooms/')
        assert r.status_code == 200, 'outsider rooms list failed'
        out_rooms = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert not any(x['id'] == room_id for x in out_rooms), 'outsider can see room (should not)'

        # Outsider cannot send or list messages in the room
        r = client.post('/api/chats/messages/', {'room': room_id, 'content': 'hi from outsider'}, format='json')
        assert r.status_code in (403, 404), f"outsider sent message: {r.status_code} {r.content}"
        r = client.get(f'/api/chats/messages/?room={room_id}')
        assert r.status_code == 200, 'outsider messages list status'
        msgs = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert len(msgs) == 0, 'outsider can read messages (should not)'

        # Back to attendee: create a message and then check edit permissions
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {att_access}')
        r = client.post('/api/chats/messages/', {'room': room_id, 'content': 'attendee message'}, format='json')
        assert r.status_code == 201, f"att message create failed: {r.status_code} {r.content}"
        att_msg_id = r.data['id']

        # Outsider trying to edit attendee message -> 404/403
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {out_access}')
        r = client.patch(f'/api/chats/messages/{att_msg_id}/', {'content': 'hacked'}, format='json')
        assert r.status_code in (403, 404), f"outsider edited message: {r.status_code} {r.content}"

        # Owner (pm) can edit attendee message
        r = client.post('/api/users/token/', {'username': 'demo_pm', 'password': 'DemoPass123!'}, format='json')
        assert r.status_code == 200, f"pm token failed (2): {r.status_code} {r.content}"
        pm_access = r.data['access']
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {pm_access}')
        r = client.patch(f'/api/chats/messages/{att_msg_id}/', {'content': 'edited by pm'}, format='json')
        assert r.status_code == 200 and r.data.get('edited_flag') == True, f"pm edit failed: {r.status_code} {r.content}"

        # Attachments: ensure they appear in message list
        r = client.get(f'/api/chats/messages/?room={room_id}')
        assert r.status_code == 200, 'pm list messages after edits failed'
        msgs = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert any((m.get('attachments') or []) for m in msgs), 'no attachments found in messages list'

        # Ordering: newest first
        r = client.post('/api/chats/messages/', {'room': room_id, 'content': 'ordering check - latest'}, format='json')
        assert r.status_code == 201, 'failed to create message for ordering'
        r = client.get(f'/api/chats/messages/?room={room_id}')
        assert r.status_code == 200
        msgs = r.data if isinstance(r.data, list) else r.data.get('results', [])
        assert len(msgs) >= 1 and msgs[0]['content'] == 'ordering check - latest', 'messages not ordered by newest first'

        self.stdout.write(self.style.SUCCESS('Smoke test: PASS'))
        self.stdout.write(self.style.SUCCESS('Extended chat checks: PASS'))