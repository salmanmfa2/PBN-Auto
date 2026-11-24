"""
Excel Data Cleaner - FastAPI Backend
"""

import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from app.api import (
    auth,
    chat,
    cleaning,
    dataset,
    feedback,
    fragment_petikan,
    insights_beta,
    menu_access,
    mutation_analysis,
    pelantikan_agenda,
    performance_kinerja,
    plt_plh,
    stored_datasets,
    upload,
)
from app.history_db import init_history_db


load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _load_config() -> dict:
    config_path = Path(__file__).resolve().parents[1] / "config.json"
    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    return {}


CONFIG = _load_config()


def _get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    configured = CONFIG.get("cors_origins", [])
    if configured:
        return [origin.strip() for origin in configured if origin.strip()]

    raw = "http://localhost:5173,http://127.0.0.1:5173"
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


HOST = os.getenv("APP_HOST", "0.0.0.0")
PORT = int(os.getenv("APP_PORT", str(CONFIG.get("backend_port", 8000))))
CORS_ORIGINS = _get_cors_origins()

app = FastAPI(
    title="Excel Data Cleaner API",
    description="Upload, clean, and export Excel/CSV datasets",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Fragment-Count",
        "X-Skipped-Name-Count",
        "X-Ignored-Page-Count",
        "X-Leftover-Page-Count",
    ],
)


@app.on_event("startup")
def startup() -> None:
    init_history_db()


app.include_router(auth.router)
app.include_router(
    auth.admin_router,
    dependencies=[Depends(menu_access.require_menu_access("admin"))],
)
app.include_router(menu_access.router)
app.include_router(chat.router)
app.include_router(feedback.router)
app.include_router(fragment_petikan.router)
app.include_router(mutation_analysis.router)
app.include_router(upload.router, tags=["upload"])
app.include_router(cleaning.router)
app.include_router(dataset.router)
app.include_router(insights_beta.router)
app.include_router(pelantikan_agenda.router)
app.include_router(performance_kinerja.router)
app.include_router(plt_plh.router)
app.include_router(stored_datasets.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


@app.get("/games/snake", tags=["games"])
def snake_game():
    game_path = Path(__file__).resolve().parent / "app" / "Games" / "snake.html"
    return FileResponse(game_path, media_type="text/html")