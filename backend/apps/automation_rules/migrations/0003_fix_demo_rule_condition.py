from django.db import migrations


def update_demo_rule(apps, schema_editor):
    Rule = apps.get_model("automation_rules", "Rule")
    Rule.objects.filter(name="Demo: High risk alert", trigger="event_risk_high").update(
        conditions={"risk_score": {">": 0.7}},
        actions=[
            {"type": "post_chat", "message": "High event risk detected. Please review."},
            {"type": "create_task", "title": "Review event risks"},
            {"type": "notify_owner"},
        ],
    )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("automation_rules", "0002_seed_demo_rule"),
    ]

    operations = [
        migrations.RunPython(update_demo_rule, noop),
    ]
