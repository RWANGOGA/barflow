from collections.abc import Awaitable, Callable
import json
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings, settings as default_settings
from .auth import RequestActor, get_actor, pin_sign_in
from .domain_routes import router as domain_router
from .operations_routes import router as operations_router
from .errors import ApiError, api_error_response, validation_error_response
from .db import check_database


DatabaseCheck = Callable[[], Awaitable[bool]]
logger = logging.getLogger('barflow.api')


def create_app(*, app_settings: Settings = default_settings, database_check: DatabaseCheck = check_database) -> FastAPI:
    app = FastAPI(
        title="Barflow API",
        version="0.1.0",
        description="Backend service for the Barflow bar-management system.",
    )
    app.include_router(domain_router)
    app.include_router(operations_router)
    app.add_exception_handler(ApiError, lambda request, error: api_error_response(error))
    app.add_exception_handler(RequestValidationError, validation_error_response)

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid4())
        started_at = perf_counter()
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        logger.info(json.dumps({
            'event': 'http_request',
            'request_id': request_id,
            'method': request.method,
            'path': request.url.path,
            'status_code': response.status_code,
            'duration_ms': round((perf_counter() - started_at) * 1000, 2),
        }))
        return response

    @app.get("/auth/me", tags=["auth"])
    async def current_actor(actor: RequestActor = Depends(get_actor)) -> dict[str, str]:
        return {"user_id": actor.user_id, "role": actor.role.value}

    @app.post("/auth/pin-sign-in", tags=["auth"])
    async def pin_sign_in_route(user_id: str, pin: str) -> dict[str, str]:
        actor = await pin_sign_in(user_id, pin)
        return {"user_id": actor.user_id, "role": actor.role.value}

    @app.get("/test-error", tags=["system"], include_in_schema=False)
    def test_error() -> None:
        raise ApiError(409, "conflict", "Test conflict.")

    @app.get("/health", tags=["system"])
    def health_check() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", tags=["system"])
    async def readiness_check() -> JSONResponse:
        if not app_settings.database_configured:
            return JSONResponse(status_code=503, content={"status": "not_ready", "reason": "database_not_configured"})
        if not await database_check():
            return JSONResponse(status_code=503, content={"status": "not_ready", "reason": "database_unavailable"})
        return JSONResponse(content={"status": "ready"})

    return app


app = create_app()
