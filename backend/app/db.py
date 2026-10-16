from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from .config import settings


@asynccontextmanager
async def connection() -> AsyncIterator[Any]:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    try:
        import asyncpg
    except ImportError as exc:
        raise RuntimeError("Install backend requirements before using database access") from exc

    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    try:
        async with pool.acquire() as conn:
            yield conn
    finally:
        await pool.close()


async def check_database() -> bool:
    try:
        async with connection() as conn:
            await conn.fetchval("select 1")
        return True
    except (RuntimeError, OSError):
        return False
