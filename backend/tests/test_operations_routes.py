from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_audit_requires_authentication():
    assert TestClient(create_app()).get('/v1/audit').status_code == 401


def test_reports_requires_authentication():
    assert TestClient(create_app()).get('/v1/reports/summary').status_code == 401


def test_cashier_cannot_read_reports(authenticated_client_factory):
    response = authenticated_client_factory('Cashier', 'user-1').get('/v1/reports/summary')
    assert response.status_code == 403
