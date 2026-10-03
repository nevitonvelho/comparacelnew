"""Read-only export. Run with the Django project's Python environment."""
import argparse
import os
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='/home/neviton/code/comparacel')
parser.add_argument('--output', default='data/django-export.json')
args = parser.parse_args()
sys.path.insert(0, args.source)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings.dev')
import django
django.setup()
from django.core import serializers
from django.apps import apps
from django.db import transaction

models = ['brands.Brand', 'products.Category', 'products.Product',
          'products.ScoreCriterion', 'products.ProductScore', 'products.ProductHighlight',
          'products.SpecGroup', 'products.SpecKey', 'products.SpecValue',
          'pricing.Store', 'pricing.Offer', 'pricing.PriceHistory', 'comparisons.Comparison']
objects = []
with transaction.atomic():
    for name in models:
        rows = list(apps.get_model(name).objects.all().order_by('pk'))
        objects.extend(rows)
        print(f'{name}: {len(rows)}')
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(serializers.serialize('json', objects, indent=2), encoding='utf-8')
print(f'Exportados {len(objects)} registros para {output}')
