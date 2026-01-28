# Generated manually for BudgetHealth model
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0003_merge_0002_event_participants_0002_event_status'),
        ('budget', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='BudgetHealth',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('total_estimated', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('total_actual', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('variance', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('status', models.CharField(choices=[('OK', 'OK'), ('WARNING', 'Warning'), ('OVERSPENT', 'Overspent')], default='OK', max_length=12)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('event', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='budget_health', to='events.event')),
            ],
        ),
    ]
