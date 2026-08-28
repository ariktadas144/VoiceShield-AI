"""Dhwani backend -- the pretrained ONNX model, used as-is.

Nothing here retrains or modifies the artifact, and the Dhwani repository is not
imported: onnxruntime plus the verified I/O contract is sufficient.

WHAT WAS VERIFIED ABOUT THE ARTIFACT, RATHER THAN ASSUMED
---------------------------------------------------------
Measured directly against best_model.onnx
(sha256 d1c232bf4d7990526804b375c15804c0ee4e9b566478b908c5a57431491b7342,
1,262,760,439 bytes):

    input   float32[batch_size, time]   -- time axis genuinely dynamic
    output  float32[1, 2]               -- batch dimension HARD-CODED to 1
    metadata: producer 'pytorch', no custom metadata, no class labels

BATCHING IS SILENTLY BROKEN. batch=2 and batch=4 both return a single (1,2) result with
no error. A caller that broadcast that one score across the batch would be confidently
wrong about every window but one, so every call asserts the batch dimension.

THE CLASS ORDER COULD NOT BE VERIFIED EMPIRICALLY, AND THAT IS DOCUMENTED HERE.
Three sources agree that index 1 is FAKE: `training/dataset.py` (`# 0 = Real, 1 = Fake`
with `labels = [0]*real + [1]*fake` under CrossEntropyLoss), `src/api/inference.py`
(`probs[0][1]`), and the model card. We follow that.

We could not confirm it on our own data because **Dhwani scores at chance on our Indic
test set under every combination tried** -- 120 bonafide + 120 spoof across the five
target languages, three preprocessing variants, both index assignments, ROC-AUC 0.457
to 0.543. When a model does not discriminate, neither orientation is distinguishable
from the other. The documented contract is therefore used on authority, not on
evidence, and `predict()` says so in its notes.

There is also no ONNX export script in the upstream repository and `src/api/config.py`
refers to a "downloaded Kaggle model", so the artifact cannot be traced to the published
training code at all.

PREPROCESSING IS ALSO UNDER-DETERMINED. Three upstream descriptions disagree: the model
card says 48,000 samples with zero-mean/unit-variance; `training/dataset.py` uses 48,000
random crops with NO normalisation; `src/api/inference.py` truncates to 48,000, applies
ZMUV, then zero-pads to 64,000 and divides logits by T=1.362. The model-card contract is
the default here because it is the one published for external use; the alternatives are
selectable for comparison.
"""

from __future__ import annotations

import hashlib
import time
from pathlib import Path

import numpy as np

from .base import SAMPLE_RATE, DetectionResult

WINDOW = 48_000          # 3.0 s, the documented training window
SERVE_PAD = 64_000       # what src/api/inference.py actually feeds the model
FAKE_IDX = 1             # per training/dataset.py, inference.py and the model card
TEMPERATURE = 1.362      # hard-coded in src/api/inference.py
EXPECTED_SHA256 = "d1c232bf4d7990526804b375c15804c0ee4e9b566478b908c5a57431491b7342"
EXPECTED_BYTES = 1_262_760_439
LANGUAGES = ("English", "Hindi", "Tamil", "Telugu", "Malayalam")


class DhwaniDetector:
    name = "dhwani"

    def __init__(self, model_path: str | Path, threads: int = 4,
                 preprocessing: str = "card", verify_hash: bool = True,
                 threshold: float | None = None, max_windows: int = 16):
        import onnxruntime as ort

        self.model_path = Path(model_path)
        if not self.model_path.exists():
            raise FileNotFoundError(
                f"{self.model_path} not found. Download best_model.onnx from "
                "https://huggingface.co/ayush2635/"
                "Dhwani-Multilingual-Deepfake-Audio-Detection-Model")

        size = self.model_path.stat().st_size
        if verify_hash:
            if size != EXPECTED_BYTES:
                raise ValueError(f"{self.model_path.name} is {size} bytes, expected "
                                 f"{EXPECTED_BYTES} -- likely a truncated download")
            digest = hashlib.sha256(self.model_path.read_bytes()).hexdigest()
            if digest != EXPECTED_SHA256:
                raise ValueError(f"sha256 {digest} != pinned {EXPECTED_SHA256}")

        if preprocessing not in ("card", "train", "serve"):
            raise ValueError("preprocessing must be one of card|train|serve")
        self.preprocessing = preprocessing
        self.threshold = threshold          # None unless the caller calibrated one
        self.max_windows = max_windows

        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        opts.intra_op_num_threads = threads
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        self.session = ort.InferenceSession(str(self.model_path), opts,
                                            providers=["CPUExecutionProvider"])
        self.input_name = self.session.get_inputs()[0].name
        self.version = f"hf:ayush2635/Dhwani@{EXPECTED_SHA256[:12]}"

    def _condition(self, window: np.ndarray) -> np.ndarray:
        """Apply one of the three upstream preprocessing descriptions."""
        w = window[:WINDOW] if len(window) >= WINDOW else np.pad(window, (0, WINDOW - len(window)))
        if self.preprocessing == "train":
            return w.astype(np.float32)
        z = ((w - w.mean()) / np.sqrt(w.var() + 1e-5)).astype(np.float32)
        if self.preprocessing == "serve":
            return np.pad(z, (0, SERVE_PAD - WINDOW)).astype(np.float32)
        return z

    def _score_one(self, window: np.ndarray) -> float:
        x = self._condition(window)[None, :]
        out = self.session.run(None, {self.input_name: x})[0]
        # The batch dimension is hard-coded to 1 in the graph and oversized batches
        # return a single row with no error. Assert rather than trust.
        if out.shape[0] != x.shape[0]:
            raise RuntimeError(
                f"Dhwani returned {out.shape[0]} rows for {x.shape[0]} inputs -- "
                "batching is unsupported, call with batch=1 only")
        logits = out[0].astype(np.float64)
        if self.preprocessing == "serve":
            logits = logits / TEMPERATURE
        z = logits - logits.max()
        e = np.exp(z)
        return float(e[FAKE_IDX] / e.sum())

    def predict(self, audio_16k_mono: np.ndarray) -> DetectionResult:
        """Segment to Dhwani's own 3 s window and score.

        The segmentation lives here rather than upstream: Dhwani's window differs from
        VoiceShield's 4.04 s, and forcing one model's contract onto the other is exactly
        the train/serve mismatch this project has spent its time removing.
        """
        y = np.asarray(audio_16k_mono, dtype=np.float32)
        seconds = len(y) / SAMPLE_RATE

        if len(y) <= WINDOW:
            windows = [y]
        else:
            hop = WINDOW // 2          # 50 % overlap, so no boundary goes unscored
            windows = [y[i:i + WINDOW] for i in range(0, len(y) - WINDOW + 1, hop)]
            if len(windows) > self.max_windows:
                pick = np.linspace(0, len(windows) - 1, self.max_windows).astype(int)
                windows = [windows[i] for i in pick]

        started = time.perf_counter()
        probs = [self._score_one(w) for w in windows]
        latency = (time.perf_counter() - started) * 1000.0

        # High-quantile pooling: a clip is suspect if any stretch of it is, but one
        # noisy window should not decide the verdict alone.
        fake = float(np.quantile(probs, 0.9)) if len(probs) > 1 else float(probs[0])
        verdict = None if self.threshold is None else (
            "SPOOF" if fake >= self.threshold else "BONAFIDE")

        return DetectionResult(
            fake_probability=round(fake, 6),
            real_probability=round(1.0 - fake, 6),
            model=self.name, model_version=self.version,
            threshold=self.threshold, verdict=verdict,
            windows_scored=len(windows), audio_seconds=round(seconds, 2),
            latency_ms=round(latency, 1),
            notes=(f"preprocessing={self.preprocessing}; fake_idx={FAKE_IDX} per upstream "
                   "source, NOT confirmed on our data (Dhwani scores at chance on it); "
                   "UNCALIBRATED" if self.threshold is None else
                   f"preprocessing={self.preprocessing}; fake_idx={FAKE_IDX} per upstream source"),
        )
