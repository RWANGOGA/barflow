import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.app.authorization import Actor, require_permission
from backend.app.main import create_app
from backend.app.schemas import Role

def test_cashier_can_create_sales():
    actor = Actor('u1', Role.cashier)
    assert require_permission(actor, 'sales.create') == actor

def test_cashier_cannot_close_day():
    with pytest.raises(HTTPException) as error:
        require_permission(Actor('user-1', Role.cashier), 'day.close')
    assert error.value.status_code == 403


def test_auth_endpoint_requires_identity_headers():
    response = TestClient(create_app()).get('/auth/me')
    assert response.status_code == 401


def test_auth_endpoint_returns_role():
    response = TestClient(create_app()).get('/auth/me', headers={'x-user-id': 'user-1', 'x-user-role': 'Cashier'})
    assert response.status_code == 200
    assert response.json() == {'user_id': 'user-1', 'role': 'Cashier'}


def test_storekeeper_can_manage_inventory():
    actor = Actor('u1', Role.storekeeper)
    assert require_permission(actor, 'inventory.manage') == actor
