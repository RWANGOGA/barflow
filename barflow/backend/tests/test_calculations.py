from backend.app.main import create_app
from fastapi.testclient import TestClient


def test_close_day_requires_authentication():
    response = TestClient(create_app()).post('/v1/day-close', json={'action': 'close'})
    assert response.status_code == 401


def test_close_day_rejects_invalid_action():
    response = TestClient(create_app()).post(
        '/v1/day-close',
        headers={'x-user-id': 'user-calc', 'x-user-role': 'Manager'},
        json={'action': 'invalid'},
    )
    assert response.status_code == 422


def test_daily_report_requires_authentication():
    response = TestClient(create_app()).get('/v1/daily-report')
    assert response.status_code == 401


def test_daily_report_returns_structure_when_no_day():
    response = TestClient(create_app()).get(
        '/v1/reports/daily',
        headers={'x-user-id': 'user-pour', 'x-user-role': 'Manager'},
    )
    assert response.status_code == 404


def test_stock_count_requires_authentication():
    response = TestClient(create_app()).post(
        '/v1/stock-counts',
        json={'day_id': 'd1', 'product_id': 'p1', 'counted_quantity': 5},
    )
    assert response.status_code == 401


def test_variance_tolerance_requires_authentication():
    response = TestClient(create_app()).post(
        '/v1/variance-tolerance',
        json={'product_id': 'p1', 'tolerance_units': 5},
    )
    assert response.status_code == 401


def test_export_requires_authentication():
    response = TestClient(create_app()).get('/v1/export')
    assert response.status_code == 401
