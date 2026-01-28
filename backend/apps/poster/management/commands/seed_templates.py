from django.core.management.base import BaseCommand
from apps.poster.models import Template

DEFAULTS = [
    {
        'name': 'Simple A4',
        'json': {
            'width': 1000,
            'height': 1414,
            'bg': '#ffffff',
            'objects': [
                {
                    'type': 'rect', 'left': 50, 'top': 50, 'width': 900, 'height': 50,
                    'fill': '#111827', 'rx': 6, 'ry': 6
                },
                {
                    'type': 'textbox', 'left': 80, 'top': 60, 'text': 'Event Title', 'fontSize': 36,
                    'fill': '#ffffff', 'fontWeight': 'bold'
                }
            ]
        }
    },
]

class Command(BaseCommand):
    help = 'Seed default poster templates'
    def handle(self, *args, **kwargs):
        for t in DEFAULTS:
            Template.objects.get_or_create(name=t['name'], defaults={'json': t['json']})
        self.stdout.write(self.style.SUCCESS('Seeded default templates'))
