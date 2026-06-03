"""Chat conversations, messages, and daily usage records."""

from __future__ import annotations

import uuid

from django.db import models

from apps.core.models import BaseModel


class Conversation(BaseModel):
    """A threaded chat session within a workspace."""

    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="conversations",
    )
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="conversations",
    )
    title = models.CharField(max_length=200, default="New conversation")
    is_pinned = models.BooleanField(default=False)
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["workspace"]),
            models.Index(fields=["last_message_at"]),
        ]
        ordering = ["-last_message_at", "-created_at"]

    def __str__(self) -> str:
        return self.title


class UsageRecord(models.Model):
    """Daily per-user message and token totals for a workspace."""

    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="usage_records",
    )
    user = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="usage_records",
    )
    date = models.DateField()
    message_count = models.PositiveIntegerField(default=0)
    token_input_count = models.PositiveIntegerField(default=0)
    token_output_count = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [("workspace", "user", "date")]
        indexes = [
            models.Index(fields=["workspace", "date"]),
            models.Index(fields=["user", "date"]),
        ]

    def __str__(self) -> str:
        return f"{self.user} @ {self.workspace} on {self.date}: {self.message_count} msgs"


class Message(models.Model):
    """A single user or assistant turn with optional RAG citations and metadata."""

    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"
        SYSTEM = "system", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=Role.choices)
    content = models.TextField()
    citations = models.JSONField(default=list)
    retrieved_chunks = models.JSONField(default=list)
    provider_name = models.CharField(max_length=50, blank=True)
    model_name = models.CharField(max_length=100, blank=True)
    prompt_tokens = models.PositiveIntegerField(null=True, blank=True)
    completion_tokens = models.PositiveIntegerField(null=True, blank=True)
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    is_cached = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["workspace"]),
        ]
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.role}: {self.content[:50]}"
