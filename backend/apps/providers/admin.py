from django.contrib import admin

from apps.providers.models import ProviderConfig


@admin.register(ProviderConfig)
class ProviderConfigAdmin(admin.ModelAdmin):
    list_display = [
        "workspace",
        "provider_name",
        "model_name",
        "api_key_last_4",
        "last_test_status",
        "last_tested_at",
        "created_at",
    ]
    list_filter = ["provider_name", "last_test_status"]
    readonly_fields = [
        "api_key_last_4",
        "last_tested_at",
        "last_test_status",
        "last_test_error",
        "created_at",
        "updated_at",
    ]
    exclude = ["encrypted_api_key"]

    def get_queryset(self, request):  # type: ignore[override]
        return super().get_queryset(request).select_related("workspace")
