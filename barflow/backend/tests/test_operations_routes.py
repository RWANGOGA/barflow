from fastapi.testclient import TestClient

from backend.app.auth import RequestActor, get_actor
from backend.app.main import create_app
from backend.app.schemas import Role


def test_audit_requires_authentication():
    assert TestClient(create_app()).get('/v1/audit').status_code == 401


def test_reports_requires_authentication():
    assert TestClient(create_app()).get('/v1/reports/summary').status_code == 401


def test_cashier_cannot_read_reports():
    app = create_app()
    app.dependency_overrides[get_actor] = lambda: RequestActor('user-1', Role.cashier)
    response = TestClient(app).get('/v1/reports/summary')
    assert response.status_code == 403
