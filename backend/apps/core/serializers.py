from typing import Any

from rest_framework import serializers


class BaseModelSerializer(serializers.ModelSerializer[Any]):
    id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
