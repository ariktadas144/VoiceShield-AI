import os

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.deepfake_service import analyze_deepfake, backend_name
from app.services.prevention_service import trigger_prevention
from app.services.prosody_service import analyze_prosody
from app.services.risk_service import calculate_risk
from app.services.speaker_service import verify_speaker

router = APIRouter()

# Beyond this the predictor is windowing far more audio than one request should
# hold the GPU for.
MAX_UPLOAD_BYTES = 25 * 1024 * 1024

# Demo mode lets the UI be shown with no model present, which is useful on a
# laptop and dangerous in production. STRICT makes the service fail closed
# instead: no model, no answer.
STRICT = os.getenv("VOICESHIELD_STRICT", "0").lower() in ("1", "true", "yes")


@router.post("/analyze/audio")
async def analyze_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty upload")
    if len(audio_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"file exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit",
        )

    # 1. Deepfake detector (fusion -> dhwani -> demo, see deepfake_service)
    try:
        deepfake = analyze_deepfake(file.filename, audio_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # A placeholder score must never be mistaken for a measurement. In strict
    # mode we refuse rather than return a number nobody can rely on.
    if deepfake.get("demo_mode") and STRICT:
        raise HTTPException(
            status_code=503,
            detail="no detector loaded and VOICESHIELD_STRICT is set — refusing to return a placeholder score",
        )

    deepfake_prob = deepfake["deepfake_probability"]

    # 2-4. Not yet trained — placeholders, labelled as such in the response so
    # no consumer mistakes them for measurements.
    speaker_match = verify_speaker(file.filename, audio_bytes)
    prosody_result = analyze_prosody(file.filename, audio_bytes)
    prosody_risk = prosody_result["overall_prosody_risk"]
    context_risk = 0.85 if "transfer" in (file.filename or "").lower() else 0.4

    # 5. Risk fusion
    risk_result = calculate_risk(
        deepfake_prob=deepfake_prob,
        speaker_match=speaker_match,
        prosody_anomaly=prosody_risk,
        context_risk=context_risk,
    )

    # 6. Prevention
    prevention_action = trigger_prevention(risk_result["risk_score"], risk_result["risk_level"])

    return {
        "filename": file.filename,
        "backend": backend_name(),
        "validated": deepfake.get("validated", False),
        "demo_mode": deepfake.get("demo_mode", False),
        "warning": deepfake.get("warning"),
        "signals": {
            "deepfake_probability": deepfake_prob,
            "speaker_match": speaker_match,
            "prosody_analysis": prosody_result,
            "context_risk": context_risk,
        },
        "deepfake_detail": deepfake,
        "signal_provenance": {
            "deepfake_probability": "model" if deepfake.get("available") else "placeholder",
            "speaker_match": "placeholder",
            "prosody_analysis": "placeholder",
            "context_risk": "placeholder",
        },
        "risk_assessment": risk_result,
        "prevention_status": prevention_action,
    }
