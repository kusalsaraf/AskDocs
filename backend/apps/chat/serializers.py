from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.chat.models import Conversation, Message
from apps.core.constants import DEFAULT_CONVERSATION_TITLE, MAX_MESSAGE_LENGTH


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
    title = serializers.CharField(
        max_length=200, default=DEFAULT_CONVERSATION_TITLE, required=False
    )


class ConversationUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200, required=False)
    is_pinned = serializers.BooleanField(required=False)


class SendMessageSerializer(serializers.Serializer):
    content = serializers.CharField(min_length=1, max_length=MAX_MESSAGE_LENGTH)
    top_k = serializers.IntegerField(
        min_value=1, max_value=20, required=False, default=settings.CHAT_DEFAULT_TOP_K
    )

    def validate_content(self, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise serializers.ValidationError("Message content cannot be empty.")
        return stripped


class SourceChunkSerializer(serializers.Serializer):
    chunk_id = serializers.UUIDField()
    excerpt = serializers.CharField()
    document_id = serializers.UUIDField()
    document_filename = serializers.CharField()
    page_number = serializers.IntegerField(allow_null=True)
    score = serializers.FloatField()


class MemberUsageSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    email = serializers.EmailField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    message_count = serializers.IntegerField()
    token_input_count = serializers.IntegerField()
    token_output_count = serializers.IntegerField()


class WorkspaceUsageSerializer(serializers.Serializer):
    total_messages = serializers.IntegerField()
    total_input_tokens = serializers.IntegerField()
    total_output_tokens = serializers.IntegerField()
    members = MemberUsageSerializer(many=True)


class QuotaSerializer(serializers.Serializer):
    user_messages_used_today = serializers.IntegerField()
    user_messages_limit = serializers.IntegerField()
    using_platform_default = serializers.BooleanField()
    global_budget_remaining = serializers.IntegerField(allow_null=True)
    workspace_usage = WorkspaceUsageSerializer(allow_null=True, required=False)
