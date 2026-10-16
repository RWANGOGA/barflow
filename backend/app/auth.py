from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

from .db import connection
from .schemas import Role


@dataclass(frozen=True)
class RequestActor:
    user_id: str
    role: Role


async def get_actor(
    x_user_id: str | None = Header(default=None),
    x_user_role: Role | None = Header(default=None),
) -> RequestActor:
    """Temporary boundary for the auth adapter; replace headers with verified Better Auth claims."""
    if not x_user_id or not x_user_role:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return RequestActor(user_id=x_user_id, role=x_user_role)


async def pin_sign_in(user_id: str, pin: str) -> RequestActor:
    """Authenticate a user by PIN; returns their role for session creation."""
    import hashlib
    async with connection() as conn:
        row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', user_id)
        if not row or not row['pin_hash']:
            raise HTTPException(status_code=400, detail='No PIN set for this user.')
        if hashlib.sha256(pin.encode()).hexdigest() != row['pin_hash']:
            raise HTTPException(status_code=403, detail='Invalid PIN.')
        role_row = await conn.fetchrow("SELECT role FROM bar_team_member WHERE user_id=$1", user_id)
        role = Role(role_row['role']) if role_row else Role.manager
    return RequestActor(user_id=user_id, role=role)


def require_role(*roles: Role):
    allowed = set(roles)

    async def dependency(actor: RequestActor = Depends(get_actor)) -> RequestActor:
        if actor.role not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return actor

    return dependency
