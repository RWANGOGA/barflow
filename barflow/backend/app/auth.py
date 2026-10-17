from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Depends, Header, HTTPException, Request

from .db import connection
from .schemas import Role


@dataclass(frozen=True)
class RequestActor:
    user_id: str
    role: Role


LOCKOUT_MAX_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15

# Better Auth default cookie name
SESSION_COOKIE_NAME = "better-auth.session_token"


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
        raise HTTPException(
            status_code=423,
            detail=f'Account locked after {LOCKOUT_MAX_ATTEMPTS} failed attempts. Try again later.',
        )


async def _actor_from_session_token(token: str) -> RequestActor | None:
    """Verify a Better Auth session token against the database."""
    async with connection() as conn:
        row = await conn.fetchrow(
            '''
            SELECT s."userId" AS user_id, s."expiresAt" AS expires_at, u.role
            FROM session s
            JOIN "user" u ON u.id = s."userId"
            WHERE s.token = $1
            ''',
            token,
        )
        if not row:
            return None

        expires_at = row['expires_at']
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            return None

        role_value = row['role'] or 'Manager'
        try:
            role = Role(role_value)
        except ValueError:
            role = Role.manager

        return RequestActor(user_id=row['user_id'], role=role)


async def get_actor(
    request: Request,
    x_user_id: str | None = Header(default=None),
    x_user_role: Role | None = Header(default=None),
) -> RequestActor:
    """
    Resolve the current actor.

    Priority:
    1. Better Auth session cookie (real verification)
    2. Temporary x-user-id / x-user-role headers (kept for migration safety)
    """
    # 1. Try real Better Auth session cookie
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        actor = await _actor_from_session_token(token)
        if actor:
            return actor

    # 2. Temporary header fallback (to be removed later)
    if x_user_id and x_user_role:
        return RequestActor(user_id=x_user_id, role=x_user_role)

    raise HTTPException(status_code=401, detail="Authentication required.")


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