import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import audio, stream
from app.services.deepfake_service import warm_up

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load the model once, at startup. Doing it lazily on the first request
    # would make that request take ~10s and skew every latency measurement.
    app.state.deepfake_ready = warm_up()
    yield


app = FastAPI(title="VoiceShield AI API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio.router, prefix="/api")
app.include_router(stream.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "VoiceShield AI Backend is running."}


@app.get("/health")
def health():
    """Surfaces which detector is live and whether it has been validated, so a
    degraded or demo deployment is visible instead of silently scoring."""
    from app.services.deepfake_service import backend_name, get_predictor

    def _window_seconds(det):
        if det is None:
            return None
        n = getattr(det, "window_samples", None)
        if not n:
            fe = getattr(det, "front_end", None)
            n = getattr(fe, "segment_samples", None) if fe is not None else None
        return round(n / 16000, 2) if n else None

    d = get_predictor()
    return {
        "status": "ok",
        "detector": {
            "backend": backend_name(),
            "loaded": d is not None,
            "model": getattr(d, "name", None) or getattr(d, "checkpoint_path", None) and str(
                getattr(d, "checkpoint_path").name),
            "validated": bool(getattr(d, "validated", d is not None)),
            "window_seconds": _window_seconds(d),
            "dev_eer": getattr(d, "dev_eer", None),
            "note": None if backend_name() == "fusion" else
                    "Dhwani is UNVALIDATED on in-domain data" if backend_name() == "dhwani" else
                    "DEMO MODE — scores are placeholders, not measurements",
        },
    }
