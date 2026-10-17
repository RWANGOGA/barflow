from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.app import auth as auth_module
from backend.app.auth import SESSION_COOKIE_NAME
from backend.app.main import create_app


class _SessionConnection:
    def __init__(self, row):
        self.row = row
        self.received_token = None

    async def fetchrow(self, _query, token):
        self.received_token = token
        return self.row


@asynccontextmanager
async def _connection_for(connection):
    yield connection


def _install_connection(monkeypatch, connection):
    monkeypatch.setattr(auth_module, 'connection', lambda: _connection_for(connection))


def test_identity_headers_alone_are_rejected():
    response = TestClient(create_app()).get(
        '/auth/me',
        headers={'x-user-id': 'forged-user', 'x-user-role': 'Admin'},
    )

    assert response.status_code == 401


def test_invalid_session_cookie_does_not_fall_back_to_identity_headers(monkeypatch):
    connection = _SessionConnection(None)
    _install_connection(monkeypatch, connection)

    client = TestClient(create_app(), cookies={SESSION_COOKIE_NAME: 'invalid-session'})
    response = client.get(
        '/auth/me',
        headers={'x-user-id': 'forged-user', 'x-user-role': 'Admin'},
    )

    assert response.status_code == 401
    assert connection.received_token == 'invalid-session'


def test_actor_identity_and_role_come_from_verified_session(monkeypatch):
    connection = _SessionConnection({
        'user_id': 'session-user',
        'role': 'Cashier',
        'expires_at': datetime.now(timezone.utc) + timedelta(minutes=5),
    })
    _install_connection(monkeypatch, connection)

    client = TestClient(create_app(), cookies={SESSION_COOKIE_NAME: 'valid-session'})
    response = client.get(
        '/auth/me',
        headers={'x-user-id': 'forged-user', 'x-user-role': 'Admin'},
    )

    assert response.status_code == 200
    assert response.json() == {'user_id': 'session-user', 'role': 'Cashier'}
    assert connection.received_token == 'valid-session'
