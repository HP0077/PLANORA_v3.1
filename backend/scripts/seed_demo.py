from django.contrib.auth.models import User
from apps.users.models import UserProfile

PM_USERNAME = 'demo_pm'
ATT_USERNAME = 'demo_att'
PASS = 'DemoPass123!'

pm, _ = User.objects.get_or_create(username=PM_USERNAME, defaults={
    'email': 'demo_pm@example.com', 'first_name': 'Demo', 'last_name': 'PM'
})
pm.set_password(PASS)
pm.save()
UserProfile.objects.update_or_create(user=pm, defaults={'role': 'manager'})

att, _ = User.objects.get_or_create(username=ATT_USERNAME, defaults={
    'email': 'demo_att@example.com', 'first_name': 'Demo', 'last_name': 'Att'
})
att.set_password(PASS)
att.save()
UserProfile.objects.update_or_create(user=att, defaults={'role': 'attendee'})

print('Seeded users:', pm.username, att.username)
