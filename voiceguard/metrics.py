"""Detection metrics for the Indic evaluation.

EER is the standard anti-spoofing operating point and is what checkpoint selection
uses. It is a few lines of arithmetic, so it lives here rather than pulling in a
framework for it.

Convention throughout (matches VoiceGuard/ASVspoof): label 1 = spoof, 0 = bonafide,
and `score` is P(spoof), so higher means more likely synthetic.
"""

from __future__ import annotations

import numpy as np


def compute_det_curve(scores: np.ndarray, labels: np.ndarray):
    """False-acceptance and false-rejection rates over every candidate threshold."""
    scores = np.asarray(scores, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)

    n_spoof = int((labels == 1).sum())
    n_bona = int((labels == 0).sum())
    if n_spoof == 0 or n_bona == 0:
        raise ValueError("need both classes present to compute a DET curve")

    order = np.argsort(scores, kind="mergesort")
    sorted_scores, sorted_labels = scores[order], labels[order]

    # Sweeping thresholds upward: spoof below threshold is a miss, bonafide at or
    # above it is a false alarm.
    tar_trial_sums = np.cumsum(sorted_labels)
    non_trial_sums = n_bona - (np.arange(1, len(sorted_labels) + 1) - tar_trial_sums)

    frr = np.concatenate((np.atleast_1d(0), tar_trial_sums / n_spoof))
    far = np.concatenate((np.atleast_1d(1), non_trial_sums / n_bona))
    thresholds = np.concatenate((np.atleast_1d(sorted_scores[0] - 1e-6), sorted_scores))
    return frr, far, thresholds


def compute_eer(scores, labels) -> tuple[float, float]:
    """Equal error rate and the threshold achieving it. Returns (eer, threshold)."""
    frr, far, thresholds = compute_det_curve(scores, labels)
    index = int(np.nanargmin(np.abs(frr - far)))
    return float((frr[index] + far[index]) / 2), float(thresholds[index])


def roc_auc(scores, labels) -> float:
    """Rank-based ROC-AUC. Threshold-free, and unlike EER it is directional: a value
    below 0.5 means the score is anti-correlated with the label, which is how an
    inverted class convention shows up."""
    scores = np.asarray(scores, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)
    if len(set(labels.tolist())) < 2:
        return float("nan")
    order = np.argsort(scores, kind="mergesort")
    ranks = np.empty(len(scores), dtype=np.float64)
    ranks[order] = np.arange(1, len(scores) + 1)
    n_pos = int((labels == 1).sum())
    n_neg = int((labels == 0).sum())
    return float((ranks[labels == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def rates_at_threshold(scores, labels, threshold: float) -> dict:
    """Operating-point rates. FPR here is a genuine voice flagged as synthetic --
    the false accusation, and the error that matters most for this application."""
    scores = np.asarray(scores, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)
    predicted = (scores >= threshold).astype(np.int64)

    tp = int(((predicted == 1) & (labels == 1)).sum())
    fp = int(((predicted == 1) & (labels == 0)).sum())
    tn = int(((predicted == 0) & (labels == 0)).sum())
    fn = int(((predicted == 0) & (labels == 1)).sum())

    return {
        "threshold": float(threshold),
        "accuracy": (tp + tn) / max(1, tp + fp + tn + fn),
        "precision": tp / max(1, tp + fp),
        "recall": tp / max(1, tp + fn),
        "f1": 2 * tp / max(1, 2 * tp + fp + fn),
        "fpr": fp / max(1, fp + tn),   # genuine flagged as spoof
        "fnr": fn / max(1, fn + tp),   # spoof passed as genuine
        "tp": tp, "fp": fp, "tn": tn, "fn": fn,
    }


def bootstrap_eer_ci(scores, labels, n_boot: int = 1000, alpha: float = 0.05, seed: int = 0):
    """Percentile bootstrap CI for EER.

    Point estimates on a few hundred clips carry a wide interval -- reporting EER
    without one invites reading noise as a result.
    """
    scores = np.asarray(scores, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)
    rng = np.random.default_rng(seed)

    samples = []
    for _ in range(n_boot):
        index = rng.integers(0, len(scores), len(scores))
        if len(set(labels[index].tolist())) < 2:
            continue
        samples.append(compute_eer(scores[index], labels[index])[0])

    if not samples:
        return float("nan"), float("nan")
    return (
        float(np.percentile(samples, 100 * alpha / 2)),
        float(np.percentile(samples, 100 * (1 - alpha / 2))),
    )
