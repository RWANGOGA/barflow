from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, Header, HTTPException

from .db import connection
from .schemas import Role


@dataclass(frozen=True)
class RequestActor:
    user_id: str
    role: Role


LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15


async def record_login_attempt(user_id: str, success: bool, ip_address: str | None = None) -> None:
    async with connection() as conn:
        await conn.execute(
            'INSERT INTO bar_login_attempts (id, user_id, attempted_at, success, ip_address) VALUES ($1,$2,$3,$4,$5)',
            str(uuid4()), user_id, datetime.now(timezone.utc), success, ip_address,
        )


async def check_lockout(user_id: str) -> None:
    window_start = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MINUTES)
    async with connection() as conn:
        row = await conn.fetchrow(
            'SELECT count(*)::int AS fails FROM bar_login_attempts WHERE user_id=$1 AND success=false AND attempted_at>=$2',
            user_id, window_start,
        )
    if row and row['fails'] >= LOCKOUT_MAX_ATTEMPTS:
        raise HTTPException(status_code=423, detail=f'Account locked after {LOCKOUT_MAX_ATTEMPTS} failed attempts. Try again later.')


async def get_actor(
    x_user_id: str | None = Header(default=None),
    x_user_role: Role | None = Header(default=None),
) -> RequestActor:
    """Temporary boundary for the auth adapter; replace headers with verified Better Auth claims."""
    if not x_user_id or not x_user_role:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return RequestActor(user_id=x_user_id, role=x_user_role)


async def pin_sign_in(user_id: str, pin: str, ip_address: str | None = None) -> RequestActor:
    """Authenticate a user by PIN; returns their role for session creation."""
    await check_lockout(user_id)
    import hashlib
    async with connection() as conn:
        row = await conn.fetchrow('SELECT pin_hash FROM bar_user_pin WHERE user_id=$1', user_id)
        if not row or not row['pin_hash']:
            await record_login_attempt(user_id, False, ip_address)
            raise HTTPException(status_code=400, detail='No PIN set for this user.')
        if hashlib.sha256(pin.encode()).hexdigest() != row['pin_hash']:
            await record_login_attempt(user_id, False, ip_address)
            raise HTTPException(status_code=403, detail='Invalid PIN.')
        await record_login_attempt(user_id, True, ip_address)
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
