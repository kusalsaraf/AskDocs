from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="document",
            name="parser_strategy",
            field=models.CharField(
                blank=True,
                choices=[("fast", "Fast"), ("hi_res", "Hi-Res"), ("auto", "Auto")],
                help_text="Per-document strategy override. Null = use UNSTRUCTURED_DEFAULT_STRATEGY env var.",
                max_length=20,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="documentchunk",
            name="parser_element_type",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Element type from the parser: Title, NarrativeText, Table, ListItem, etc.",
                max_length=50,
            ),
        ),
    ]
