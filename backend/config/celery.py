import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("config")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "reap-stuck-documents": {
        "task": "apps.documents.tasks.reap_stuck_documents",
        "schedule": crontab(minute="*/10"),
    },
}
