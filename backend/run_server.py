import json
import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

def _load_config() -> dict:
    config_path = Path(__file__).resolve().parents[1] / "config.json"
    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    return {}


if __name__ == "__main__":
    config = _load_config()
    load_dotenv(Path(__file__).resolve().parent / ".env")
    host = os.getenv("APP_HOST", config.get("host", "0.0.0.0"))
    if host.lower() == "auto":
        host = "0.0.0.0"
    port = int(os.getenv("APP_PORT", str(config.get("backend_port", 8000))))
    uvicorn.run("main:app", host=host, port=port, reload=False)
