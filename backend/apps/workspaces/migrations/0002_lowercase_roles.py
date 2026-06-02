from django.db import migrations


def uppercase_to_lowercase(apps, schema_editor):
    Membership = apps.get_model("workspaces", "Membership")
    WorkspaceInvitation = apps.get_model("workspaces", "WorkspaceInvitation")

    for model in (Membership, WorkspaceInvitation):
        for obj in model.objects.filter(role__in=["ADMIN", "MEMBER", "VIEWER"]):
            obj.role = obj.role.lower()
            obj.save(update_fields=["role"])


def lowercase_to_uppercase(apps, schema_editor):
    Membership = apps.get_model("workspaces", "Membership")
    WorkspaceInvitation = apps.get_model("workspaces", "WorkspaceInvitation")

    for model in (Membership, WorkspaceInvitation):
        for obj in model.objects.filter(role__in=["admin", "member", "viewer"]):
            obj.role = obj.role.upper()
            obj.save(update_fields=["role"])


class Migration(migrations.Migration):
    dependencies = [
        ("workspaces", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="membership",
            name="role",
            field=__import__("django.db.models", fromlist=["CharField"]).CharField(
                choices=[("admin", "Admin"), ("member", "Member"), ("viewer", "Viewer")],
                default="member",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="workspaceinvitation",
            name="role",
            field=__import__("django.db.models", fromlist=["CharField"]).CharField(
                choices=[("admin", "Admin"), ("member", "Member"), ("viewer", "Viewer")],
                default="member",
                max_length=10,
            ),
        ),
        migrations.RunPython(uppercase_to_lowercase, reverse_code=lowercase_to_uppercase),
    ]
