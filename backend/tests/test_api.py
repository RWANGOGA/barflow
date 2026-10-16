from fastapi.testclient import TestClient

from backend.app import main
from backend.app.config import Settings


client = TestClient(main.app)


def test_health_check():
    response = client.get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_readiness_requires_database_configuration(monkeypatch):
    monkeypatch.setattr(main, 'settings', Settings(database_url=''))
    response = client.get('/ready')
    assert response.status_code == 503
    assert response.json() == {'status': 'not_ready', 'reason': 'database_not_configured'}


def test_readiness_returns_ready_when_database_is_available(monkeypatch):
    monkeypatch.setattr(main, 'settings', Settings(database_url='postgresql://test'))
    monkeypatch.setattr(main, 'check_database', lambda: _ready())
    response = client.get('/ready')
    assert response.status_code == 200
    assert response.json() == {'status': 'ready'}


async def _ready():
    return True
