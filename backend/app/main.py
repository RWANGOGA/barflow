from fastapi import FastAPI

app = FastAPI(
    title="Barflow API",
    version="0.1.0",
    description="Backend service for the Barflow bar-management system.",
)


@app.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}
