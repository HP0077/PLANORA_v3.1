from django.db import migrations


DEMO_NAME = "Demo: High risk alert"
DEMO_TRIGGER = "event_risk_high"
DEMO_CONDITIONS = {"risk_score__gt": 0.7}
DEMO_ACTIONS = [
    {"type": "post_chat", "message": "High event risk detected. Please review."},
    {"type": "create_task", "title": "Review event risks"},
    {"type": "notify_owner"},
]


def seed_demo_rule(apps, schema_editor):
    Rule = apps.get_model("automation_rules", "Rule")
    User = apps.get_model("auth", "User")

    user = (
        User.objects.filter(is_superuser=True).order_by("id").first()
        or User.objects.order_by("id").first()
    )
    if not user:
        return

    Rule.objects.get_or_create(
        trigger=DEMO_TRIGGER,
        name=DEMO_NAME,
        event=None,
        defaults={
            "conditions": DEMO_CONDITIONS,
            "actions": DEMO_ACTIONS,
            "is_active": True,
            "created_by_id": user.id,
        },
    )


def unseed_demo_rule(apps, schema_editor):
    Rule = apps.get_model("automation_rules", "Rule")
    Rule.objects.filter(
        trigger=DEMO_TRIGGER,
        name=DEMO_NAME,
        event__isnull=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("automation_rules", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_demo_rule, unseed_demo_rule),
    ]
