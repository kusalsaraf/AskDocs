import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("workspaces", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Conversation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(default="New conversation", max_length=200)),
                ("is_pinned", models.BooleanField(default=False)),
                ("last_message_at", models.DateTimeField(blank=True, db_index=True, null=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="conversations",
                        to="workspaces.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="conversations",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["-last_message_at", "-created_at"],
                "indexes": [
                    models.Index(fields=["workspace"], name="chat_conver_workspa_idx"),
                    models.Index(fields=["last_message_at"], name="chat_conver_last_me_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="Message",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("role", models.CharField(choices=[("user", "User"), ("assistant", "Assistant"), ("system", "System")], max_length=20)),
                ("content", models.TextField()),
                ("citations", models.JSONField(default=list)),
                ("retrieved_chunks", models.JSONField(default=list)),
                ("provider_name", models.CharField(blank=True, max_length=50)),
                ("model_name", models.CharField(blank=True, max_length=100)),
                ("prompt_tokens", models.PositiveIntegerField(blank=True, null=True)),
                ("completion_tokens", models.PositiveIntegerField(blank=True, null=True)),
                ("latency_ms", models.PositiveIntegerField(blank=True, null=True)),
                ("is_cached", models.BooleanField(default=False)),
                ("error_message", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "conversation",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="chat.conversation",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="workspaces.workspace",
                    ),
                ),
            ],
            options={
                "ordering": ["created_at"],
                "indexes": [
                    models.Index(fields=["conversation", "created_at"], name="chat_messag_convers_idx"),
                    models.Index(fields=["workspace"], name="chat_messag_workspa_idx"),
                ],
            },
        ),
    ]
