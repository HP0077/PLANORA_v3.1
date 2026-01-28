# Generated manually to extend CertificateRecord
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0002_event_status'),
        ('poster', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='certificaterecord',
            name='event',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='certificate_records', to='events.event'),
        ),
        migrations.AddField(
            model_name='certificaterecord',
            name='recipient_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='certificaterecord',
            name='file',
            field=models.FileField(blank=True, null=True, upload_to='certificates/'),
        ),
        migrations.AddField(
            model_name='certificaterecord',
            name='source_filename',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='certificaterecord',
            name='status',
            field=models.CharField(default='generated', max_length=20),
        ),
        migrations.AddField(
            model_name='certificaterecord',
            name='meta',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
