"""
SQLite-compatible version of the documents migration for test environments.
Replaces VectorField with TextField and omits the HNSW index (pgvector-specific).
"""
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
            name="Document",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("filename", models.CharField(max_length=255)),
                ("file_size_bytes", models.PositiveIntegerField(default=0)),
                ("mime_type", models.CharField(blank=True, max_length=100)),
                ("status", models.CharField(
                    choices=[("pending", "Pending"), ("processing", "Processing"), ("ready", "Ready"), ("failed", "Failed")],
                    default="pending",
                    max_length=20,
                )),
                ("error_message", models.TextField(blank=True)),
                ("uploaded_by", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="uploaded_documents",
                    to=settings.AUTH_USER_MODEL,
                )),
                ("workspace", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="documents",
                    to="workspaces.workspace",
                )),
            ],
        ),
        migrations.CreateModel(
            name="DocumentChunk",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("content", models.TextField()),
                ("chunk_index", models.PositiveIntegerField()),
                ("page_number", models.PositiveIntegerField(blank=True, null=True)),
                # TextField instead of VectorField — pgvector not available in SQLite
                ("embedding", models.TextField(default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("document", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="chunks",
                    to="documents.document",
                )),
                ("workspace", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="chunks",
                    to="workspaces.workspace",
                )),
            ],
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(fields=["workspace", "status"], name="documents_d_workspa_9cf75b_idx"),
        ),
        migrations.AddIndex(
            model_name="document",
            index=models.Index(fields=["workspace", "created_at"], name="documents_d_workspa_466057_idx"),
        ),
        migrations.AddIndex(
            model_name="documentchunk",
            index=models.Index(fields=["workspace"], name="documents_d_workspa_3cf707_idx"),
        ),
        migrations.AddIndex(
            model_name="documentchunk",
            index=models.Index(fields=["document", "chunk_index"], name="documents_d_documen_8ea6ce_idx"),
        ),
        # HNSW index omitted — pgvector is PostgreSQL-only
    ]
