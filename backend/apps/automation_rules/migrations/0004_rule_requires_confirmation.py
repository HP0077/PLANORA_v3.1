from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("automation_rules", "0003_fix_demo_rule_condition"),
    ]

    operations = [
        migrations.AddField(
            model_name="rule",
            name="requires_confirmation",
            field=models.BooleanField(default=True),
        ),
    ]
