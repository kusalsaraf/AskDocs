from __future__ import annotations

from rest_framework import serializers

from apps.documents.models import Document


class _UploadedBySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj) -> str:
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.email


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by = _UploadedBySerializer(read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "filename",
            "file_size_bytes",
            "mime_type",
            "status",
            "error_message",
            "uploaded_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields
