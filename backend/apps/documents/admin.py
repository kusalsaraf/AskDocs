from __future__ import annotations

from django.contrib import admin

from apps.documents.models import Document, DocumentChunk


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ["filename", "workspace", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["filename"]


@admin.register(DocumentChunk)
class DocumentChunkAdmin(admin.ModelAdmin):
    list_display = ["id", "document", "chunk_index", "page_number"]
    raw_id_fields = ["document", "workspace"]
