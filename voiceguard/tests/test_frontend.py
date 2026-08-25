"""Guard the train/serve front end and the metric implementations.

The original repository's central defect was that `main.py` and `eval.py` fed the
model different things -- hand-crafted feature vectors versus raw waveforms. Both now
route through `audio_utils`, and these tests fail if they ever diverge again.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

import audio_utils  # noqa: E402
from metrics import bootstrap_eer_ci, compute_eer, rates_at_threshold  # noqa: E402

NB_SAMP = 64_600


@pytest.fixture
def wav(tmp_path):
    sr = 22_050  # deliberately not 16 kHz, so resampling is exercised
    t = np.arange(int(3.7 * sr)) / sr
    y = (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32)
    path = tmp_path / "probe.wav"
    sf.write(path, y, sr)
    return path


def test_pad_crops_and_tiles():
    x = np.arange(10, dtype=np.float32)
    assert len(audio_utils.pad(x, 5)) == 5
    tiled = audio_utils.pad(x, 23)
    assert len(tiled) == 23
    # Tiled, not zero-padded: zeros would teach the model that silence carries a class.
    np.testing.assert_array_equal(tiled[:10], x)
    np.testing.assert_array_equal(tiled[10:20], x)
    np.testing.assert_array_equal(tiled[20:], x[:3])


def test_peak_normalise_sets_peak_and_survives_silence():
    y = np.array([0.1, -0.2, 0.05], dtype=np.float32)
    assert np.isclose(np.abs(audio_utils.peak_normalise(y)).max(), 0.95)
    silence = np.zeros(16, dtype=np.float32)
    assert np.array_equal(audio_utils.peak_normalise(silence), silence)  # no div-by-zero


def test_normalisation_removes_gain_differences():
    """Two recordings of the same signal at different levels must become identical --
    this is what denies the model the corpus's ~4.5 dB real/TTS loudness cue."""
    base = np.sin(np.linspace(0, 40, 4000)).astype(np.float32)
    loud, quiet = base * 0.9, base * 0.05
    np.testing.assert_allclose(
        audio_utils.peak_normalise(loud), audio_utils.peak_normalise(quiet), atol=1e-6
    )


def test_prepare_resamples_and_fixes_length(wav):
    x = audio_utils.prepare(wav, NB_SAMP, target_sr=16_000)
    assert x.shape == (NB_SAMP,)
    assert x.dtype == np.float32
    assert np.isfinite(x).all()


def test_training_and_inference_windows_are_identical(wav):
    """The regression test for the original train/serve mismatch.

    The training Dataset and the eval CLI must derive bit-identical input from the
    same file. If someone reintroduces a feature extractor on either side, this fails.
    """
    import eval as eval_cli
    from main import Dataset_Indic

    manifest = wav.parent / "train.txt"
    manifest.write_text(f"{wav.name} 1\n")

    dataset = Dataset_Indic(manifest, nb_samp=NB_SAMP, sample_rate=16_000, normalise=True)
    train_x, label = dataset[0]
    assert label == 1

    y = audio_utils.load_audio(wav, 16_000, normalise=True)
    infer_x = torch.from_numpy(np.ascontiguousarray(eval_cli.segment(y, NB_SAMP)[0])).float()

    assert torch.equal(train_x, infer_x), "training and inference front ends diverged"


def test_segment_keeps_the_tail():
    """The original `if (i+1) == range(...)` branch was never true, so the final
    partial window fell through and part of every long clip went unscored."""
    import eval as eval_cli

    y = np.random.RandomState(0).randn(int(NB_SAMP * 1.6)).astype(np.float32)
    windows = eval_cli.segment(y, NB_SAMP)
    assert len(windows) == 2, "the 0.6-window tail must still be scored"
    assert all(len(w) == NB_SAMP for w in windows)


def test_eer_is_correct_on_known_distributions():
    rng = np.random.default_rng(0)
    bona, spoof = rng.normal(0, 1, 2000), rng.normal(6, 1, 2000)
    scores = np.concatenate([bona, spoof])
    labels = np.concatenate([np.zeros(2000), np.ones(2000)])
    eer, threshold = compute_eer(scores, labels)
    assert eer < 0.01                      # 6 sigma apart -> near-perfect
    assert 2.0 < threshold < 4.0           # midpoint

    same = np.concatenate([rng.normal(0, 1, 2000), rng.normal(0, 1, 2000)])
    chance, _ = compute_eer(same, labels)
    assert 0.45 < chance < 0.55            # indistinguishable -> chance


def test_rates_orientation():
    """FPR must count genuine audio flagged as spoof -- the false accusation.
    Getting this backwards would make the safety-critical number the wrong one."""
    scores = np.array([0.9, 0.9, 0.1, 0.1])
    labels = np.array([0, 0, 1, 1])        # both classes scored exactly wrong
    rates = rates_at_threshold(scores, labels, 0.5)
    assert rates["fpr"] == 1.0
    assert rates["fnr"] == 1.0


def test_bootstrap_ci_brackets_point_estimate():
    rng = np.random.default_rng(1)
    scores = np.concatenate([rng.normal(0, 1, 300), rng.normal(2, 1, 300)])
    labels = np.concatenate([np.zeros(300), np.ones(300)])
    eer, _ = compute_eer(scores, labels)
    low, high = bootstrap_eer_ci(scores, labels, n_boot=300, seed=0)
    assert low <= eer <= high
