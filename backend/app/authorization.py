from dataclasses import dataclass
from fastapi import HTTPException
from .schemas import Role

PERMISSIONS: dict[str, set[Role]] = {
    'sales.create': {Role.admin, Role.manager, Role.cashier},
    'tabs.manage': {Role.admin, Role.manager, Role.cashier},
    'inventory.manage': {Role.admin, Role.manager, Role.storekeeper},
    'day.close': {Role.admin, Role.manager},
    'reports.read': {Role.admin, Role.manager},
    'team.manage': {Role.admin, Role.manager},
    'audit.read': {Role.admin, Role.manager},
}

@dataclass(frozen=True)
class Actor:
    user_id: str
    role: Role

def require_permission(actor: Actor, permission: str) -> Actor:
    allowed = PERMISSIONS.get(permission, set())
    if actor.role not in allowed:
        raise HTTPException(status_code=403, detail='You do not have permission for this action.')
    return actor
