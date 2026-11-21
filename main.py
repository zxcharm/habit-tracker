import os
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from tracker.api import SAMPLE_HABITS, router
from tracker.storage import initialize


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize()
    yield


app = FastAPI(title="Путь · Habit Tracker", version="1.1.0", lifespan=lifespan)
app.include_router(router)
frontend = Path(__file__).resolve().parent / "frontend" / "dist"


@app.middleware("http")
async def public_transport(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    origin = os.environ.get("HABIT_PUBLIC_ORIGIN")
    if not origin:
        return await call_next(request)

    behind_pythonanywhere = os.environ.get("HABIT_PYTHONANYWHERE") == "1"
    if not behind_pythonanywhere and request.url.scheme == "http":
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"{origin}{request.url.path}{query}")

    response = await call_next(request)
    response.headers["Strict-Transport-Security"] = "max-age=31536000"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/habits", include_in_schema=False)
def starter_habits() -> list[dict[str, int | str]]:
    return [{"id": index, "name": name} for index, (name, _) in enumerate(SAMPLE_HABITS, 1)]

if (frontend / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def dashboard() -> Response:
    index = frontend / "index.html"
    if not index.is_file():
        raise HTTPException(503, "Build the frontend with npm run build --prefix frontend.")
    if os.environ.get("HABIT_PYTHONANYWHERE") == "1" and os.environ.get("HABIT_PUBLIC_ORIGIN"):
        upgrade = "<script>if (location.protocol === 'http:') location.protocol = 'https:';</script>"
        return HTMLResponse(index.read_text(encoding="utf-8").replace("<head>", "<head>" + upgrade, 1))
    return FileResponse(index)
