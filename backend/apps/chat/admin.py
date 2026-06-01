from django.contrib import admin

from apps.chat.models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ["title", "workspace", "created_by", "is_pinned", "last_message_at", "created_at"]  # noqa: E501
    list_filter = ["is_pinned", "workspace"]
    search_fields = ["title"]
    raw_id_fields = ["workspace", "created_by"]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ["id", "conversation", "role", "provider_name", "is_cached", "created_at"]
    list_filter = ["role", "is_cached", "provider_name"]
    raw_id_fields = ["conversation", "workspace"]
