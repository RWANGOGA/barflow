from dataclasses import dataclass
import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:  # python-dotenv is optional; deployments inject real env vars
    load_dotenv = None

if load_dotenv is not None:
    # Local runs reuse the same file as Next.js. Render injects real environment variables,
    # and load_dotenv does not override values that already exist.
    _root = Path(__file__).resolve().parents[2]
    load_dotenv(_root / '.env.local')
    load_dotenv(_root / '.env')


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    app_env: str = os.getenv("APP_ENV", "development")

    @property
    def database_configured(self) -> bool:
        return bool(self.database_url)


settings = Settings()
