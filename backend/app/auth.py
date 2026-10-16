from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException

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


def require_role(*roles: Role):
    allowed = set(roles)

    async def dependency(actor: RequestActor = Depends(get_actor)) -> RequestActor:
        if actor.role not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission for this action.")
        return actor

    return dependency
