from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('timeline', '0001_initial'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='timelineentry',
            index=models.Index(fields=['event', '-created_at'], name='timeline_entry_event_created_idx'),
        ),
    ]
