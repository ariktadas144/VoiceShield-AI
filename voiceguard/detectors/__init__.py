"""Selectable detector backends.

Selection happens here, at configuration level -- neither backend imports or knows about
the other, so either can be replaced without touching the surrounding system.
"""

from .base import Detector, DetectionResult, SAMPLE_RATE

BACKENDS = ("voiceguard", "dhwani")
DEFAULT_BACKEND = "voiceguard"          # the model this project adapted

DEFAULT_VOICEGUARD_CKPT = "frozen/voiceguard-indic-v0.1.pth"
DEFAULT_DHWANI_ONNX = ("/home/aayushdwivedi/Projects/VoiceShield-AI/"
                       "data/external_models/dhwani/best_model.onnx")


def build_detector(backend: str = DEFAULT_BACKEND, **kwargs) -> Detector:
    """Construct one backend by name. Imports are lazy so that selecting VoiceGuard
    does not require onnxruntime, and selecting Dhwani does not require torch."""
    backend = (backend or DEFAULT_BACKEND).lower()
    if backend == "voiceguard":
        from .voiceguard_backend import VoiceGuardDetector
        return VoiceGuardDetector(kwargs.pop("checkpoint", DEFAULT_VOICEGUARD_CKPT), **kwargs)
    if backend == "dhwani":
        from .dhwani_backend import DhwaniDetector
        return DhwaniDetector(kwargs.pop("model_path", DEFAULT_DHWANI_ONNX), **kwargs)
    raise ValueError(f"unknown backend {backend!r}; choose from {BACKENDS}")


__all__ = ["Detector", "DetectionResult", "SAMPLE_RATE", "BACKENDS",
           "DEFAULT_BACKEND", "build_detector"]
