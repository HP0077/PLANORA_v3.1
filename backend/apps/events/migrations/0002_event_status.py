# Generated manually for Event.status
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='status',
            field=models.CharField(choices=[('DRAFT', 'Draft'), ('PLANNING', 'Planning'), ('LIVE', 'Live'), ('COMPLETED', 'Completed'), ('ARCHIVED', 'Archived')], default='DRAFT', max_length=20),
        ),
    ]
