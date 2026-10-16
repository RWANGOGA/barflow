import pytest
from fastapi import HTTPException
from backend.app.authorization import Actor, require_permission
from backend.app.schemas import Role

def test_cashier_can_create_sales():
    actor = Actor('u1', Role.cashier)
    assert require_permission(actor, 'sales.create') == actor

def test_cashier_cannot_close_day():
    with pytest.raises(HTTPException) as error:
        require_permission(Actor('u1', Role.cashier), 'day.close')
    assert error.value.status_code == 403

def test_storekeeper_can_manage_inventory():
    actor = Actor('u1', Role.storekeeper)
    assert require_permission(actor, 'inventory.manage') == actor
