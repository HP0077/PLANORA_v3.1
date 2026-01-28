from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from apps.users.models import UserProfile

class Command(BaseCommand):
    help = 'Seed demo PM and attendee users'

    def handle(self, *args, **options):
        users = [
            ('demo_pm', 'demo_pm@example.com', 'Demo', 'PM', 'manager'),
            ('demo_att', 'demo_att@example.com', 'Demo', 'Att', 'attendee'),
        ]
        for username, email, first, last, role in users:
            u, _ = User.objects.get_or_create(username=username, defaults={'email': email, 'first_name': first, 'last_name': last})
            u.set_password('DemoPass123!')
            u.save()
            UserProfile.objects.update_or_create(user=u, defaults={'role': role})
        self.stdout.write(self.style.SUCCESS('Seeded demo users: demo_pm / demo_att'))
