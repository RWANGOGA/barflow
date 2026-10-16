from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "")
    app_env: str = os.getenv("APP_ENV", "development")

    @property
    def database_configured(self) -> bool:
        return bool(self.database_url)


settings = Settings()
