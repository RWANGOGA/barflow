from collections.abc import Awaitable, Callable

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import Settings, settings as default_settings
from .db import check_database


DatabaseCheck = Callable[[], Awaitable[bool]]


def create_app(*, app_settings: Settings = default_settings, database_check: DatabaseCheck = check_database) -> FastAPI:
    app = FastAPI(
        title="Barflow API",
        version="0.1.0",
        description="Backend service for the Barflow bar-management system.",
    )

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
