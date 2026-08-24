# Dhwani Prototype — Verified Model Contract & Tested Workflow

**Status:** pre-implementation, model characterised
**Date:** 2026-08-25

---

## 1. What we actually measured about Dhwani

Nothing below is from the model card. All of it was measured directly against
`data/external_models/dhwani/best_model.onnx` (1.26 GB, verified byte-exact).
Two of these findings are silent-failure traps that would have broken the
prototype in ways that produce *plausible but wrong* numbers.

### 1.1 The I/O contract

| Property | Measured value |
|---|---|
| Input | `input: float32[batch_size, time]` — time axis is **dynamic** |
| Output | `output: float32[1, 2]` — **batch dimension is hard-coded to 1** |
| Architecture | Wav2Vec2 XLS-R 300M front-end + AASIST back-end |
| Sample rate | 16 kHz mono |
| Trained window | 3.0 s (48,000 samples) |
| Class order | index **0 = fake**, index **1 = real** |
| Spoof score | `logit[0] − logit[1]` (higher = more likely spoof) |

### 1.2 ⚠ Trap 1 — batching is silently broken

```
batch=1  ->  output (1, 2)   OK
batch=2  ->  output (1, 2)   ← returns ONE result, no error
batch=4  ->  output (1, 2)   ← returns ONE result, no error
```

Feeding a batch of 4 windows returns a single score with **no exception and no
warning**. A naive implementation would broadcast that one score across all four
windows and produce confidently wrong output for three of them.

**Consequence for the prototype:** `batch_size = 1` is mandatory. Throughput must
come from multiple concurrent sessions/threads, never from batching. The
inference wrapper must `assert output.shape[0] == input.shape[0]` on every call —
this assertion is the only thing standing between us and that failure.

### 1.3 ⚠ Trap 2 — input normalisation is undocumented and costs 12 pp

Wav2Vec2 expects zero-mean / unit-variance input. The model card does not say so.
Measured on 100 ASVspoof 2019 dev clips (50 bonafide / 50 spoof):

| Input preprocessing | EER | class separation |
|---|---|---|
| raw PCM scaled to [−1, 1] | 42.0 % | +0.37 |
| peak-normalised | 42.0 % | +0.37 |
| **zero-mean unit-variance** | **30.0 %** | **+2.96** |

Getting this wrong does not crash anything. It just quietly costs 12 percentage
points of accuracy — the exact class of train/serve preprocessing mismatch the
main pipeline was designed to prevent.

### 1.4 Performance — and the honest caveat

**~30 % EER on ASVspoof 2019 LA dev** (n=100, so the 95 % confidence interval is
roughly ±9 pp — this is an indicative number, not a precise one).

For scale:

| System | EER | on |
|---|---|---|
| Our fusion model | **0.55 %** | ASVspoof 2019 dev (in-domain) |
| RawNet2 (challenge baseline) | 22.38 % | ASVspoof 2021 DF (out-of-domain) |
| **Dhwani** | **~30 %** | ASVspoof 2019 dev (out-of-domain **for Dhwani**) |

**This is not evidence that Dhwani is a bad model.** It was trained on Common
Voice Indic + IndicSynth — modern Indic TTS. ASVspoof 2019 uses 2019-era
vocoders and English speakers. This is precisely the "catastrophic generalisation
failure" the research blueprint warns about, measured in the wild.

The correct conclusion is narrower and more useful:

> **Dhwani is currently unvalidated on any data we possess.** It is weak
> out-of-domain, and we have no in-domain data to test whether it is strong where
> it was designed to be strong.

### 1.5 Latency

**338 ms per 3 s window on CPU** (8 threads) → **RTF ≈ 0.113**.

That is marginally *above* the RTF ≤ 0.1 target and consumes 68 % of the
500 ms end-to-end budget on its own. On CPU, Dhwani is borderline for real-time.
GPU execution or ONNX Runtime graph optimisation is required before it can meet
the SLA — this must be measured, not assumed.

---

## 2. The go / no-go gate

**Do not build the prototype around Dhwani as a dependency.** Build it around a
model-agnostic interface, with Dhwani as one swappable backend that must earn its
place by passing this gate:

```
GATE D — Dhwani in-domain validation
  Input : ≥ 500 real + 500 synthetic clips from Dhwani's own domain
          (IndicSynth slice, or Indic TTS we generate ourselves)
  Pass  : EER ≤ 10 % in-domain
  Fail  : Dhwani is demoted to "experimental", prototype ships on our model
```

Until Gate D passes, every Dhwani score carries `confidence=UNVALIDATED` and the
risk engine must not weight it. This is not bureaucracy — shipping an unvalidated
detector that outputs a confident-looking percentage is how a fraud system
generates false accusations.

**Cheapest path to Gate D:** one IndicSynth language (Malayalam, 24 GB, the
smallest) gives ~34 k synthetic clips, paired with Common Voice Malayalam for the
bonafide side. That is enough to close the question for ~24 GB and one afternoon,
versus 845 GB for the full corpus.

---

## 3. Prototype architecture

The prototype exists to prove **the streaming path**, not to advance model
accuracy. Every component is the simplest thing that exercises a real interface.

```
 ┌────────────────┐   WS, L16 16k     ┌──────────────────┐
 │ REPLAY GATEWAY │ ─────────────────▶│  STREAMING       │
 │ (fake ①)       │   real-time rate  │  BRIDGE  ← my    │
 │ plays a WAV    │◀───────────────── │  part            │
 └────────────────┘                   └────────┬─────────┘
                                               │ gRPC bidi
                                               │ 3.0 s windows, batch=1
                                      ┌────────▼─────────┐
                                      │ INFERENCE SERVER │
                                      │  ┌────────────┐  │
                                      │  │ Detector   │  │  ← one interface,
                                      │  │ interface  │  │    two backends
                                      │  └─┬────────┬─┘  │
                                      │    │        │    │
                                      │ Dhwani   Fusion  │
                                      │ (ONNX)   (ours)  │
                                      └────────┬─────────┘
                                               │
                                      ┌────────▼─────────┐
                                      │ RISK STUB + WS   │
                                      │ DASHBOARD (④)    │
                                      └──────────────────┘
```

**The single most important design decision:** the detector interface.

```python
class Detector(Protocol):
    name: str
    version: str
    window_samples: int      # 48000 for Dhwani, 32000-64600 for ours
    validated: bool          # False until Gate D passes
    def score(self, pcm: np.ndarray) -> DetectorResult: ...
```

Because the bridge reads `window_samples` **from the detector**, swapping Dhwani
for our model changes the window size from 3.0 s to 2.0 s automatically, with no
code change in the bridge. This is the same principle as reading window length
from the checkpoint config (§BF-04 of the bridge spec) — one source of truth.

### 3.1 Window-size consequence

Dhwani's 3.0 s window changes the user-visible timing:

| | our model | Dhwani |
|---|---|---|
| window | 2.0 s | 3.0 s |
| time-to-first-score | ~2.4 s | **~3.4 s** |

If the prototype demos on Dhwani, the deck cannot claim sub-2-second alerting.
Decide this before the demo script is written, not during it.

---

## 4. The workflow — phase by phase, each with an exit test

The rule: **a phase is not finished until its exit test passes.** No phase begins
before the previous one's test is green. This is what prevents the integration-day
failure where four components meet for the first time and nothing works.

### Phase 0 — Freeze the contract *(½ day)*

Deliverables: `voiceshield.proto` frozen; `Detector` protocol agreed; window
size, sample rate, normalisation, and class order written down in one file that
all four people import.

**Exit test:** all four members can generate stubs from the same `.proto` and a
round-trip serialise/deserialise test passes in each of their languages.

### Phase 1 — Detector wrapper, offline *(1 day)*

Wrap Dhwani behind `Detector`. Enforce: zero-mean unit-variance normalisation,
`batch=1`, shape assertion, NaN guard, fixed class order.

**Exit tests:**
1. `assert out.shape[0] == 1` fires if anyone ever passes batch > 1.
2. Scoring the same clip twice returns bit-identical results (determinism).
3. Known-bonafide clip scores lower than known-spoof clip on a hand-picked pair.
4. Feeding silence returns a result, not an exception.
5. Feeding 0.5 s of audio returns a result (dynamic time axis confirmed).
6. **Golden-file test:** 20 clips with committed expected scores. Any change to
   preprocessing that shifts these numbers fails CI loudly.

Test 6 is the one that catches the normalisation trap forever.

### Phase 2 — Replay gateway + bridge core *(2 days)*

Replay harness plays a WAV over WebSocket at controllable rate/jitter/loss.
Bridge ingests, windows, and calls the detector **in-process** (no gRPC yet).

**Exit tests:**
1. Windows produced by the live path are **bit-identical** to windows produced by
   the offline front-end on the same WAV. *(This is the single highest-value test
   in the plan — it proves no train/serve skew.)*
2. Ring buffer never exceeds its cap under 10× real-time input.
3. A 1.2 s clip yields one `partial=true` window; a 0.3 s clip yields
   `INSUFFICIENT_AUDIO`.
4. `sample_offset` stays monotonic across an injected 300 ms gap.

### Phase 3 — gRPC transport *(1 day)*

Split the detector into a separate process behind bidirectional gRPC.

**Exit tests:**
1. Scores from the gRPC path match the in-process path exactly.
2. Kill the inference process mid-stream → bridge enters L3 within 5 s, emits
   `DETECTOR_UNAVAILABLE`, call survives, recovers automatically on restart.
3. Shuffle response order in a mock server → reorder buffer restores order.
4. Inference stalled to 2 s/window → hop widens, ingest never blocks.

### Phase 4 — Risk stub + dashboard *(1 day)*

Minimal fusion (deepfake signal only, honest about the rest) and a live WebSocket
dashboard showing the score timeline.

**Exit tests:**
1. `DETECTOR_UNAVAILABLE` renders as "unverified", **never** as low risk.
2. Unvalidated model → dashboard shows the `UNVALIDATED` badge.
3. Dashboard disconnect does not affect the audio path.

### Phase 5 — End-to-end demo rehearsal *(½ day)*

**Exit test — the full demo script, run five times consecutively, unattended,
with zero manual intervention.** If it fails once in five, it is not ready. Demos
fail on the run that matters; the only defence is repetition before that run.

---

## 5. Failure modes this workflow is designed to prevent

| Failure | Where it would surface | What prevents it |
|---|---|---|
| Silent batch collapse | wrong scores, no error | Phase 1 shape assertion |
| Wrong normalisation | −12 pp accuracy, no error | Phase 1 golden-file test |
| Train/serve window skew | good offline, bad live | Phase 2 bit-identical test |
| Out-of-order scores | timeline jitter on dashboard | Phase 3 reorder test |
| Detector down = "safe" | **false negative fraud** | Phase 3 + 4 L3 tests |
| Unvalidated model trusted | false accusations | Gate D + `UNVALIDATED` badge |
| Window size mismatch | subtle accuracy loss | detector owns `window_samples` |
| Demo-day collapse | reputational | Phase 5 five-run rehearsal |

---

## 6. Honest risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Dhwani fails Gate D | **Medium-high** — it is weak on the only data we have | Prototype ships on our fusion model; Dhwani stays experimental |
| Dhwani too slow on CPU (RTF 0.113) | High | GPU execution provider, or ORT graph optimisation; measure before committing |
| No Indic validation data | **Certain today** | 24 GB IndicSynth slice (Malayalam) unblocks it |
| 3 s window breaks the "sub-2 s" claim | Certain if we demo on Dhwani | Fix the claim, or demo on our 2 s model |
| Four-way integration slips | Medium | Phase 0 contract freeze + replay harness lets each part be proven alone |

---

## 7. Recommendation

Build the prototype **model-agnostic, ship it on our validated fusion model
(0.55 % dev EER), and treat Dhwani as a second backend behind Gate D.**

That way the prototype cannot be blocked by a model we have not yet been able to
validate, we keep the Indic story alive as a real engineering path rather than a
claim, and if Dhwani passes its gate it drops in with no architectural change —
because the interface was designed for exactly that from the start.
