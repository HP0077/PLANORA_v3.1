# Generated for Event Intelligence Engine
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('events', '0002_event_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventProfile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('risk_score', models.FloatField(default=0)),
                ('readiness_score', models.FloatField(default=1)),
                ('engagement_score', models.IntegerField(default=0)),
                ('overdue_tasks', models.IntegerField(default=0)),
                ('budget_variance', models.FloatField(default=0)),
                ('inactivity_days', models.IntegerField(default=0)),
                ('missing_meeting', models.BooleanField(default=False)),
                ('last_computed_at', models.DateTimeField(auto_now=True)),
                ('event', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='intelligence_profile', to='events.event')),
            ],
        ),
    ]
