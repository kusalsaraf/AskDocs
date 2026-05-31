from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self) -> None:
        from django.db.models.signals import post_save

        from apps.accounts.models import User
        from apps.accounts.signals import handle_user_created

        post_save.connect(handle_user_created, sender=User)
