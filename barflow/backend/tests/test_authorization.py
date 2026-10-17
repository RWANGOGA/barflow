import pytest
from fastapi import HTTPException

from backend.app.authorization import Actor, require_permission
from backend.app.schemas import Role


@pytest.mark.parametrize('role,permission,allowed', [
    (Role.admin, 'inventory.manage', True),
    (Role.manager, 'inventory.manage', True),
    (Role.storekeeper, 'inventory.manage', True),
    (Role.cashier, 'inventory.manage', False),
    (Role.admin, 'audit.read', True),
    (Role.manager, 'audit.read', True),
    (Role.cashier, 'audit.read', False),
    (Role.storekeeper, 'audit.read', False),
    (Role.admin, 'tabs.reopen', True),
    (Role.manager, 'tabs.reopen', False),
])
def test_permission_matrix(role, permission, allowed):
    actor = Actor('user-1', role)
    if allowed:
        assert require_permission(actor, permission) == actor
    else:
        with pytest.raises(HTTPException) as error:
            require_permission(actor, permission)
        assert error.value.status_code == 403


def test_unknown_permission_is_denied():
    with pytest.raises(HTTPException) as error:
        require_permission(Actor('user-1', Role.admin), 'not-a-permission')
    assert error.value.status_code == 403
