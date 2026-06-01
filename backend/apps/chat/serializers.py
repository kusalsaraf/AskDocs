from __future__ import annotations

from rest_framework import serializers

from apps.chat.models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = [
            "id",
            "role",
            "content",
            "citations",
            "provider_name",
            "model_name",
            "prompt_tokens",
            "completion_tokens",
            "latency_ms",
            "is_cached",
            "error_message",
            "created_at",
        ]
        read_only_fields = fields


class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    created_by_id = serializers.UUIDField(source="created_by.id", read_only=True, allow_null=True)

    class Meta:
        model = Conversation
        fields = [
            "id",
            "workspace",
            "created_by_id",
            "title",
            "is_pinned",
            "last_message_at",
            "created_at",
            "updated_at",
            "messages",
        ]
        read_only_fields = [
            "id", "workspace", "created_by_id", "last_message_at",
            "created_at", "updated_at", "messages",
        ]


class ConversationListSerializer(serializers.ModelSerializer):
    created_by_id = serializers.UUIDField(source="created_by.id", read_only=True, allow_null=True)

    class Meta:
        model = Conversation
        fields = [
            "id",
            "workspace",
            "created_by_id",
            "title",
            "is_pinned",
            "last_message_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class ConversationCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, default="New conversation", required=False)


class ConversationUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    is_pinned = serializers.BooleanField(required=False)


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1, max_length=10000)
    top_k = serializers.IntegerField(min_value=1, max_value=20, required=False, default=5)

    def validate_content(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Message content cannot be empty.")
        return stripped


class SourceChunkSerializer(serializers.Serializer):
    chunk_id = serializers.UUIDField()
    content = serializers.CharField()
    document_id = serializers.UUIDField()
    document_filename = serializers.CharField()
    page_number = serializers.IntegerField(allow_null=True)
    score = serializers.FloatField()


class QuotaSerializer(serializers.Serializer):
    user_messages_used_today = serializers.IntegerField()
    user_messages_limit = serializers.IntegerField()
    using_platform_default = serializers.BooleanField()
    global_budget_remaining = serializers.IntegerField(allow_null=True)
