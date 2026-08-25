"""Prove VoiceGuard's adapted RawNet is numerically identical to the official one.

The Indic adaptation initialises VoiceGuard from the official ASVspoof 2021
Baseline-RawNet2 checkpoint. That is only legitimate if VoiceGuard's `model.py`
computes exactly what the official `model.py` computes -- a checkpoint that merely
*loads* without error can still be silently wrong (wrong filter bank, transposed
head, reordered blocks). "The forward pass ran" is not evidence.

So this compares the two implementations directly: same weights, same waveform,
logits must be bit-identical -- `torch.equal`, not `allclose`. Any future edit to
`model.py` that changes the maths breaks this test, which is the point.

`official_rawnet2_reference.py` is a verbatim copy of
`asvspoof-challenge/2021/LA/Baseline-RawNet2/model.py`, used only here.

Run:  python -m pytest tests/test_equivalence.py -v
      python tests/test_equivalence.py            # standalone, prints the table
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest
import torch

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from weights.load_pretrained import DEFAULT_CKPT, build_model, load_config, load_pretrained  # noqa: E402

needs_ckpt = pytest.mark.skipif(
    not DEFAULT_CKPT.exists(), reason=f"{DEFAULT_CKPT.name} not present; see weights/PROVENANCE.md"
)


def _official_module():
    path = Path(__file__).parent / "official_rawnet2_reference.py"
    spec = importlib.util.spec_from_file_location("official_rawnet2_reference", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _probe_signals(n: int = 64_600):
    """Deliberately varied: broadband, quiet speech-like, degenerate, and tonal."""
    torch.manual_seed(0)
    t = torch.arange(n, dtype=torch.float32) / 16_000
    return {
        "gaussian": torch.randn(1, n),
        "quiet speech-like": torch.randn(1, n) * 0.05,
        "digital silence": torch.zeros(1, n),
        "1 kHz sine": torch.sin(2 * np.pi * 1000 * t)[None, :],
        "impulse train": torch.tensor(
            [[1.0 if i % 160 == 0 else 0.0 for i in range(n)]], dtype=torch.float32
        ),
    }


def _load_pair():
    official_mod = _official_module()

    # load_config() returns a FRESH deep copy each call, and that matters here:
    # RawNet.__init__ rewrites d_args['filts'][2][0] in place, so handing the same
    # dict (or a shallow dict(cfg)) to a second constructor builds block2 with the
    # wrong channel count. Upstream-official behaviour; see weights/load_pretrained.
    official = official_mod.RawNet(load_config(), "cpu")
    official.load_state_dict(torch.load(DEFAULT_CKPT, map_location="cpu", weights_only=True))
    official.eval()

    adapted, report = load_pretrained(build_model(load_config()), device="cpu")
    adapted.eval()
    return official, adapted, report


@needs_ckpt
def test_official_checkpoint_loads_strict_into_reference():
    """Sanity: the checkpoint really is the official one, unmodified."""
    official_mod = _official_module()
    model = official_mod.RawNet(load_config(), "cpu")
    model.load_state_dict(
        torch.load(DEFAULT_CKPT, map_location="cpu", weights_only=True)
    )  # strict=True


@needs_ckpt
def test_adaptation_coverage():
    _, _, report = _load_pair()
    assert report["unexpected_keys"] == []
    assert report["matched_tensors"] == 119
    assert report["total_tensors"] == 123
    # Only the LibriSeVoc head is uninitialised.
    assert all("multi_gru" in k for k in report["missing_keys"])
    assert report["coverage_pct"] > 94.0


@needs_ckpt
def test_sinc_filter_banks_identical():
    """SincConv has no learnable parameters; its bank comes from sample_rate alone,
    so a rate mismatch would silently change the front end without any load error."""
    official, adapted, _ = _load_pair()
    assert adapted.Sinc_conv.sample_rate == 16_000
    assert official.Sinc_conv.sample_rate == 16_000
    np.testing.assert_array_equal(official.Sinc_conv.mel, adapted.Sinc_conv.mel)


@needs_ckpt
@pytest.mark.parametrize("name", list(_probe_signals()))
def test_logits_bit_identical(name):
    official, adapted, _ = _load_pair()
    x = _probe_signals()[name]
    with torch.no_grad():
        expected = official(x)
        got, _multi = adapted(x)      # adapted returns (binary, multi)
    assert torch.equal(expected, got), f"{name}: max|delta|={(expected - got).abs().max():.3e}"


def _main() -> int:
    if not DEFAULT_CKPT.exists():
        print(f"{DEFAULT_CKPT} missing; see weights/PROVENANCE.md")
        return 1
    official, adapted, report = _load_pair()
    print(f"tensors matched : {report['matched_tensors']}/{report['total_tensors']}")
    print(f"unexpected keys : {report['unexpected_keys'] or 'none'}")
    print(f"params covered  : {report['coverage_pct']:.1f}%")
    print(f"sinc banks equal: {np.array_equal(official.Sinc_conv.mel, adapted.Sinc_conv.mel)}")
    print()
    print(f"{'input':22s} {'max|delta logit|':>17}  {'bit-identical':>14}")
    ok = True
    for name, x in _probe_signals().items():
        with torch.no_grad():
            a = official(x)
            b, _ = adapted(x)
        same = torch.equal(a, b)
        ok &= same
        print(f"{name:22s} {(a - b).abs().max().item():17.3e}  {str(same):>14}")
    print()
    print("EQUIVALENT" if ok else "DIVERGENCE DETECTED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
