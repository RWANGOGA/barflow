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


def test_tabs_require_authentication():
    response = TestClient(create_app()).get('/v1/tabs')
    assert response.status_code == 401


def test_tabs_validate_status_filter():
    response = TestClient(create_app()).get('/v1/tabs?status=invalid', headers=headers())
    assert response.status_code == 422


def test_tab_items_require_authentication():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/items', json={'product_id': 'p1', 'quantity': 1})
    assert response.status_code == 401


def test_tab_items_validate_quantity():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/items', headers=headers(), json={'product_id': 'p1', 'quantity': 0})
    assert response.status_code == 422


def test_update_tab_item_requires_positive_quantity():
    response = TestClient(create_app()).patch('/v1/tabs/tab-1/items/item-1', headers=headers(), json={'quantity': 0})
    assert response.status_code == 422


def test_remove_tab_item_requires_authentication():
    response = TestClient(create_app()).delete('/v1/tabs/tab-1/items/item-1')
    assert response.status_code == 401


def test_settle_tab_requires_authentication():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/settle', json={'payment_method': 'cash', 'idempotency_key': 'settle-12345'})
    assert response.status_code == 401


def test_settle_tab_validates_idempotency_key():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/settle', headers=headers(), json={'payment_method': 'cash', 'idempotency_key': 'short'})
    assert response.status_code == 422
