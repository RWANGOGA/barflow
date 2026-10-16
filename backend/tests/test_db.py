import pytest

from backend.app import db
from backend.app.config import Settings


@pytest.mark.asyncio
async def test_connection_requires_database_url(monkeypatch):
    monkeypatch.setattr(db, 'settings', Settings(database_url=''))
    with pytest.raises(RuntimeError, match='DATABASE_URL is not configured'):
        async with db.connection():
            pass
