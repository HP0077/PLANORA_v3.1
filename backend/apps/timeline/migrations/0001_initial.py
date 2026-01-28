from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('events', '0003_merge_0002_event_participants_0002_event_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='TimelineEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('type', models.CharField(choices=[('event_status', 'Event status change'), ('task_created', 'Task created'), ('task_updated', 'Task updated'), ('task_completed', 'Task completed'), ('budget_item_created', 'Budget item created'), ('budget_item_updated', 'Budget item updated'), ('automation', 'Automation trigger'), ('automation_rule', 'Automation rule action'), ('certificate_generated', 'Certificate generated'), ('chat_system', 'Chat system message'), ('file_uploaded', 'File uploaded'), ('poster_edit', 'Poster edit/lock'), ('user_joined', 'User joined'), ('user_left', 'User left')], max_length=64)),
                ('source', models.CharField(max_length=128)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='timeline_entries', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='timeline_entries', to='events.event')),
            ],
            options={'ordering': ['-created_at'],},
        ),
    ]
