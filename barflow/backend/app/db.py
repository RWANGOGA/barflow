from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from .config import settings

_pool: Any = None


async def get_pool() -> Any:
    global _pool
    if _pool is None:
        if not settings.database_url:
            raise RuntimeError('DATABASE_URL is not configured')
        try:
            import asyncpg
        except ImportError as exc:
            raise RuntimeError('Install backend requirements before using database access') from exc
        _pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=5)
    return _pool


@asynccontextmanager
async def connection() -> AsyncIterator[Any]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


async def check_database() -> bool:
    try:
        async with connection() as conn:
            await conn.fetchval('select 1')
        return True
    except (RuntimeError, OSError):
        return False
