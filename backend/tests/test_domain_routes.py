from fastapi.testclient import TestClient

from backend.app.main import create_app


def headers(role='Cashier'):
    return {'x-user-id': 'user-1', 'x-user-role': role}


def test_sales_requires_authentication():
    response = TestClient(create_app()).post('/v1/sales', json={'payment_method': 'cash', 'items': [{'product_id': 'p1', 'quantity': 1}], 'idempotency_key': 'sale-12345'})
    assert response.status_code == 401


def test_sales_validates_idempotency_key_before_database():
    response = TestClient(create_app()).post('/v1/sales', headers=headers(), json={'payment_method': 'cash', 'items': [{'product_id': 'p1', 'quantity': 1}], 'idempotency_key': 'short'})
    assert response.status_code == 422


def test_cashier_cannot_close_day():
    response = TestClient(create_app()).post('/v1/day-close', headers=headers())
    assert response.status_code == 403
