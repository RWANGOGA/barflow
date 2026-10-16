from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app


def test_health_check():
    response = TestClient(create_app()).get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}


def test_readiness_requires_database_configuration():
    app = create_app(app_settings=Settings(database_url=''))
    response = TestClient(app).get('/ready')
    assert response.status_code == 503
    assert response.json() == {'status': 'not_ready', 'reason': 'database_not_configured'}


def test_readiness_returns_ready_when_database_is_available():
    async def ready():
        return True

    app = create_app(app_settings=Settings(database_url='postgresql://test'), database_check=ready)
    response = TestClient(app).get('/ready')
    assert response.status_code == 200
    assert response.json() == {'status': 'ready'}


def test_readiness_reports_database_outage():
    async def unavailable():
        return False

    app = create_app(app_settings=Settings(database_url='postgresql://test'), database_check=unavailable)
    response = TestClient(app).get('/ready')
    assert response.status_code == 503
    assert response.json() == {'status': 'not_ready', 'reason': 'database_unavailable'}
