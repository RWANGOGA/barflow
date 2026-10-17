from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from backend.app.auth import RequestActor, get_actor
from backend.app.main import create_app
from backend.app.schemas import Role


@pytest.fixture
def authenticated_client_factory() -> Callable[..., TestClient]:
    """Build a test client with an explicit actor for route-level tests."""
    def make_client(role: Role | str = Role.cashier, user_id: str = 'user-1') -> TestClient:
        app = create_app()
        actor_role = role if isinstance(role, Role) else Role(role)

        async def resolve_actor() -> RequestActor:
            return RequestActor(user_id=user_id, role=actor_role)

        app.dependency_overrides[get_actor] = resolve_actor
        return TestClient(app)

    return make_client
