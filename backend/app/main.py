from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import settings
from .db import check_database

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
    if not settings.database_configured:
        return JSONResponse(status_code=503, content={"status": "not_ready", "reason": "database_not_configured"})
    if not await check_database():
        return JSONResponse(status_code=503, content={"status": "not_ready", "reason": "database_unavailable"})
    return JSONResponse(content={"status": "ready"})
