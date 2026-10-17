from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app


def test_api_error_contract():
    response = TestClient(create_app()).get('/test-error')
    assert response.status_code == 409
    assert response.json() == {'error': {'code': 'conflict', 'message': 'Test conflict.', 'details': None}}


def test_health_check():
    response = TestClient(create_app()).get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}
    assert response.headers['x-request-id']


def test_request_id_is_preserved():
    response = TestClient(create_app()).get('/health', headers={'x-request-id': 'request-123'})
    assert response.headers['x-request-id'] == 'request-123'


def test_request_observability_does_not_change_health_response(caplog):
    with caplog.at_level('INFO', logger='barflow.api'):
        response = TestClient(create_app()).get('/health')
    assert response.status_code == 200
    assert any('http_request' in record.message for record in caplog.records)


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
