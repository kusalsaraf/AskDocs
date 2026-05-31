import pytest


@pytest.fixture(autouse=False)
def _django_db_setup() -> None:
    pass
