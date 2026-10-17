from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_audit_requires_authentication():
    assert TestClient(create_app()).get('/v1/audit').status_code == 401


def test_reports_requires_authentication():
    assert TestClient(create_app()).get('/v1/reports/summary').status_code == 401


def test_cashier_cannot_read_reports():
    response = TestClient(create_app()).get('/v1/reports/summary', headers={'x-user-id': 'user-1', 'x-user-role': 'Cashier'})
    assert response.status_code == 403
