from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_sales_requires_authentication():
    response = TestClient(create_app()).post('/v1/sales', json={'payment_method': 'cash', 'items': [{'product_id': 'p1', 'quantity': 1}], 'idempotency_key': 'sale-12345'})
    assert response.status_code == 401


def test_sales_validates_idempotency_key_before_database(authenticated_client_factory):
    response = authenticated_client_factory().post('/v1/sales', json={'payment_method': 'cash', 'items': [{'product_id': 'p1', 'quantity': 1}], 'idempotency_key': 'short'})
    assert response.status_code == 422


def test_cashier_cannot_close_day(authenticated_client_factory):
    response = authenticated_client_factory('Cashier').post('/v1/day-close')
    assert response.status_code == 403


def test_tabs_require_authentication():
    response = TestClient(create_app()).get('/v1/tabs')
    assert response.status_code == 401


def test_tabs_validate_status_filter(authenticated_client_factory):
    response = authenticated_client_factory().get('/v1/tabs?status=invalid')
    assert response.status_code == 422


def test_tab_items_require_authentication():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/items', json={'product_id': 'p1', 'quantity': 1})
    assert response.status_code == 401


def test_tab_items_validate_quantity(authenticated_client_factory):
    response = authenticated_client_factory().post('/v1/tabs/tab-1/items', json={'product_id': 'p1', 'quantity': 0})
    assert response.status_code == 422


def test_update_tab_item_requires_positive_quantity(authenticated_client_factory):
    response = authenticated_client_factory().patch('/v1/tabs/tab-1/items/item-1', json={'quantity': 0})
    assert response.status_code == 422


def test_remove_tab_item_requires_authentication():
    response = TestClient(create_app()).delete('/v1/tabs/tab-1/items/item-1')
    assert response.status_code == 401


def test_settle_tab_requires_authentication():
    response = TestClient(create_app()).post('/v1/tabs/tab-1/settle', json={'payment_method': 'cash', 'idempotency_key': 'settle-12345'})
    assert response.status_code == 401


def test_settle_tab_validates_idempotency_key(authenticated_client_factory):
    response = authenticated_client_factory().post('/v1/tabs/tab-1/settle', json={'payment_method': 'cash', 'idempotency_key': 'short'})
    assert response.status_code == 422


def test_void_tab_requires_manager_permission(authenticated_client_factory):
    response = authenticated_client_factory('Cashier', 'cashier-1').post('/v1/tabs/tab-1/void', json={'reason': 'Correction'})
    assert response.status_code == 403


def test_reopen_tab_requires_admin_permission(authenticated_client_factory):
    response = authenticated_client_factory('Manager', 'manager-1').post('/v1/tabs/tab-1/reopen', json={'reason': 'Approved correction'})
    assert response.status_code == 403


def test_inventory_count_requires_authentication():
    response = TestClient(create_app()).post('/v1/inventory/counts', json={'product_id': 'p1', 'counted_quantity': 2})
    assert response.status_code == 401


def test_inventory_count_rejects_negative_quantity(authenticated_client_factory):
    response = authenticated_client_factory('Storekeeper').post('/v1/inventory/counts', json={'product_id': 'p1', 'counted_quantity': -1})
    assert response.status_code == 422


def test_adjustment_requires_nonzero_quantity(authenticated_client_factory):
    response = authenticated_client_factory('Storekeeper').post('/v1/inventory/adjustments', json={'product_id': 'p1', 'quantity': 0, 'adjustment_type': 'wastage', 'reason': 'Spillage'})
    assert response.status_code == 422


def test_adjustment_requires_authentication():
    response = TestClient(create_app()).post('/v1/inventory/adjustments', json={'product_id': 'p1', 'quantity': -1, 'adjustment_type': 'wastage', 'reason': 'Spillage'})
    assert response.status_code == 401


def test_inventory_movements_require_authentication():
    response = TestClient(create_app()).get('/v1/inventory/movements')
    assert response.status_code == 401


def test_inventory_variance_requires_authentication():
    response = TestClient(create_app()).get('/v1/inventory/variance')
    assert response.status_code == 401


def test_audit_requires_authentication():
    response = TestClient(create_app()).get('/v1/audit')
    assert response.status_code == 401


def test_cashier_cannot_read_audit(authenticated_client_factory):
    response = authenticated_client_factory('Cashier').get('/v1/audit')
    assert response.status_code == 403
