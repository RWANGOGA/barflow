from contextlib import asynccontextmanager

from fastapi.testclient import TestClient

from backend.app import domain_routes
from backend.app.main import create_app


class _NoBusinessDayConnection:
    async def fetchrow(self, *_args):
        return None


@asynccontextmanager
async def _connection_without_business_day():
    yield _NoBusinessDayConnection()


def test_close_day_requires_authentication():
    response = TestClient(create_app()).post('/v1/day-close', json={'action': 'close'})
    assert response.status_code == 401


def test_close_day_rejects_invalid_action(authenticated_client_factory):
    response = authenticated_client_factory('Manager', 'user-calc').post('/v1/day-close', json={'action': 'invalid'})
    assert response.status_code == 422


def test_daily_report_requires_authentication():
    response = TestClient(create_app()).get('/v1/daily-report')
    assert response.status_code == 401


def test_daily_report_returns_not_found_when_no_day(monkeypatch, authenticated_client_factory):
    monkeypatch.setattr(domain_routes, 'connection', _connection_without_business_day)
    response = authenticated_client_factory('Manager', 'user-pour').get('/v1/daily-report')
    assert response.status_code == 404


def test_stock_count_requires_authentication():
    response = TestClient(create_app()).post('/v1/stock-counts', json={'day_id': 'd1', 'product_id': 'p1', 'counted_quantity': 5})
    assert response.status_code == 401


def test_variance_tolerance_requires_authentication():
    response = TestClient(create_app()).post('/v1/variance-tolerance', json={'product_id': 'p1', 'tolerance_units': 5})
    assert response.status_code == 401


def test_export_requires_authentication():
    response = TestClient(create_app()).get('/v1/export')
    assert response.status_code == 401
