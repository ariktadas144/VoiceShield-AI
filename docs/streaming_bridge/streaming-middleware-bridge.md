# Streaming Middleware Bridge (gRPC) — Design & Edge Case Specification

**Owner:** Component 2 of 4
**Status:** Design — pre-implementation
**Last updated:** 2026-08-25

---

## 0. One-paragraph summary

The bridge is the **only stateful, real-time component** in VoiceShield. It accepts
live forked call audio from the telephony gateway over several dissimilar
transports, normalises all of them into one canonical PCM timeline, slices that
timeline into fixed analysis windows, ships those windows to the AI/DSP engine
over a bidirectional gRPC stream, and fans the returned scores out to the risk
engine and dashboard — all inside a 500 ms end-to-end budget, for ~1,200
concurrent calls per node, **without ever being able to ask the caller to slow
down**.

That last clause is the entire difficulty of this component. Every other service
in the system can apply backpressure to its upstream. A phone call cannot be
paused. Everything below follows from that.

---

## 1. Scope and team contract

### 1.1 What this component owns

| Owns | Does **not** own |
|---|---|
| Ingress protocol adapters (WebSocket / AudioSocket / Twilio) | SIP signalling, call routing, `mod_audio_stream` config |
| Canonical frame normalisation (codec, rate, channels, endianness) | Model inference, feature extraction, VAD model weights |
| Per-session state & lifecycle | Risk fusion weights, thresholds, prevention actions |
| Jitter absorption, ring buffering, windowing | Dashboard rendering |
| gRPC client transport, pooling, flow control, retry | The `.proto` **semantics** (co-owned with #3) |
| Result reordering, dedup, fan-out | Long-term storage of scores |
| Backpressure & load shedding policy | — |
| Latency budget enforcement & observability | — |

### 1.2 Interfaces — the four contracts

```
                    ┌─────────────────────────────────────┐
  ①  Telephony  ──▶ │   ②  STREAMING MIDDLEWARE BRIDGE    │ ──▶  ③  AI / DSP
     Gateway    ◀── │        (this document)              │ ◀──      Engine
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                            ④  Risk Engine
                              + Dashboard
```

**Contract A — Gateway → Bridge (ingress).** Must be agreed with #1 before either
side writes code. Non-negotiable fields:

| Field | Why it must exist |
|---|---|
| `session_id` | Correlates every downstream artefact. Server-issued or HMAC-signed. |
| `encoding` | `L16_LE` / `L16_BE` / `PCMU` / `PCMA` / `OPUS`. Never inferred. |
| `sample_rate` | 8000 or 16000. Never assumed. |
| `channels` + `leg` | Mono required. If the gateway forks both legs, they arrive as **two sessions**, never mixed. |
| `sample_offset` | Cumulative samples since call start — the authoritative clock (§3.2). |
| `concealed` | True when the gateway synthesised this frame via packet-loss concealment (§AU-08). |
| `consent` | DPDP gate. No consent → no forwarding (§SC-01). |

**Contract B — Bridge → AI Engine (gRPC).** Extends the blueprint's proto:

```protobuf
service AntiSpoofService {
  rpc StreamAudioContext (stream AudioChunk) returns (stream RiskScoreUpdate);
}

message AudioChunk {
  string call_session_id = 1;
  bytes  pcm_audio_payload = 2;   // float32 LE, 16 kHz mono, exactly window_samples
  int64  timestamp = 3;           // ns, bridge monotonic — for SLA only
  uint64 window_seq = 4;          // monotonic per session, gap-free unless gap_before
  uint64 sample_offset = 5;       // first sample index of this window
  bool   gap_before = 6;          // discontinuity precedes this window
  bool   partial = 7;             // zero-padded/tiled, shorter than a full window
  string session_epoch = 8;       // fencing token; bumped on re-INVITE / resume
}

message RiskScoreUpdate {
  string call_session_id = 1;
  uint64 window_seq = 2;          // echoed — required for reordering
  float  spoof_probability = 3;   // 0.0–1.0, calibrated
  float  asv_similarity = 4;      // -1.0–1.0
  float  combined_risk_score = 5; // 0–100
  bool   threshold_breached = 6;
  string recommended_action = 7;  // ALLOW | WARN | TERMINATE
  string model_version = 8;       // required — never mix versions in one call
  ResultStatus status = 9;        // OK | SKIPPED_SILENCE | ERROR | DEGRADED
}
```

Two additions to the blueprint's proto are load-bearing: **`window_seq` echoed on
the response** (without it, out-of-order results are unrecoverable — §IN-06) and
**`model_version`** (without it, a mid-call hot-swap silently mixes two models'
score distributions — §IN-03).

**Contract C — Bridge → Risk Engine.** Ordered, deduplicated, gap-annotated
`RiskScoreUpdate` stream. The risk engine may assume monotonic `window_seq` and
must handle `gap_before=true` by resetting any temporal smoothing.

**Contract D — Bridge → Dashboard.** Best-effort WebSocket. Lossy by design; the
dashboard is never in the critical path and must never apply backpressure that
reaches the audio path.

---

## 2. Architecture

```
 FreeSWITCH mod_audio_stream ─┐
 (WS, L16, 8k/16k, mono)      │
                              │
 Asterisk AudioSocket ────────┤    ┌──────────────────┐
 (TCP, framed, SLIN16)        ├───▶│ INGRESS ADAPTERS │  N protocols → 1 frame
                              │    └────────┬─────────┘
 Twilio Media Streams ────────┤             │
 (WSS, base64 μ-law 8k JSON)  │             ▼
                              │    ┌──────────────────┐
 WebRTC demo client ──────────┘    │ SESSION MANAGER  │  lifecycle, fencing, consent
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │  JITTER + RING   │  bounded, per session
                                   │     BUFFER       │  drop-oldest on overflow
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │    WINDOWER      │  2.0 s window / 100 ms hop
                                   │  (VAD-gated)     │  sample-accurate
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │ gRPC CLIENT POOL │  bidi streams, N conns
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │  RESULT DEMUX    │  reorder, dedup, monotonic
                                   └────────┬─────────┘
                                            ▼
                                   ┌──────────────────┐
                                   │     FAN-OUT      │  risk engine / dash / CRM
                                   └──────────────────┘
```

### 2.1 Threading model

One asyncio event loop per worker process; **no per-session threads.** At 1,200
concurrent sessions, a thread-per-session model costs ~9.6 GB of stack alone and
collapses on context switching. Sessions are coroutines; the ring buffer is
lock-free per session because exactly one producer (ingress) and one consumer
(windower) touch it.

CPU-bound work (resampling, VAD, float conversion) runs in a bounded
`ProcessPoolExecutor`, **never** on the event loop — a 5 ms blocking resample on
the loop, at 1,200 sessions × 50 frames/s, is 300 s of blocking per second.

---

## 3. The canonical model

### 3.1 Canonical frame

```python
@dataclass(frozen=True, slots=True)
class AudioFrame:
    session_id: str
    session_epoch: str      # fencing token
    seq: int                # monotonic per session
    sample_offset: int      # cumulative samples since session start
    pcm: np.ndarray         # float32, 16 kHz, mono, [-1, 1]
    recv_ts_ns: int         # bridge monotonic clock
    concealed: bool         # gateway-synthesised (PLC)
    synthetic_silence: bool # bridge-inserted to close a timeline gap
```

### 3.2 `sample_offset` is the clock — not wall time

Every timing decision uses cumulative sample count, never `time.time()`.

- Wall clock drifts, jumps (NTP), and differs per pod.
- Gateways run on their own oscillator; 8000.5 Hz vs an assumed 8000 Hz
  accumulates **1.8 s of error over an hour**.
- Windowing must be reproducible: the same audio must produce the same windows
  regardless of when packets happened to arrive.

Wall clock is used for exactly one thing: measuring latency against the SLA.

---

## 4. Latency budget

Total end-to-end target: **< 500 ms**, caller-speaks → risk score delivered.

| Stage | Budget | Notes |
|---|---:|---|
| Gateway fork + network to bridge | 30 ms | #1's responsibility; measure, don't assume |
| Ingress decode (μ-law→PCM, resample 8k→16k) | 5 ms | soxr VHQ; must match training front-end |
| Jitter buffer target depth | 60 ms | tunable; the single biggest lever |
| Window assembly (hop quantisation) | 100 ms | equals hop size — a window is only ready every 100 ms |
| gRPC serialise + network | 10 ms | same VPC/host; protobuf, not JSON |
| **Inference (window 2 s, RTF ≤ 0.1)** | **200 ms** | #3's budget |
| Result demux + reorder wait | 20 ms | bounded |
| Fan-out to risk engine | 10 ms | |
| **Subtotal** | **435 ms** | |
| **Slack** | **65 ms** | GC pauses, scheduler jitter, retries |

**Time-to-first-score** is a separate number and is dominated by window fill:
2.0 s of audio must exist before the first full window. First score lands at
**~2.4 s** into a call. This must be stated explicitly in any product claim —
"sub-2-second detection" is only true if measured from *window availability*, not
from call start. Do not let the deck claim otherwise.

---

## 5. Windowing

- **Window:** 2.0 s = 32,000 samples @ 16 kHz. Must equal the DSP engine's
  configured `segment_samples`. Mismatch is a silent correctness bug — the model
  was trained on a specific length range (2.0–4.04 s).
- **Hop:** 100 ms = 1,600 samples → 10 scores/second, 95 % overlap.
- **Alignment:** sample-accurate. Hop by exact sample counts, never by frames
  (frames may be 10/20/30/40 ms; §AU-05).
- **VAD gate:** a window with no detected speech is **not sent**. It saves ~40 %
  of inference at typical talk ratios and prevents nonsense scores on silence.
  Skipped windows emit `status=SKIPPED_SILENCE` so downstream can tell "silent"
  from "we lost the pipeline".

Memory per session: 4 s ring × 16 kHz × 4 B = **256 KB**. At 1,200 sessions =
**~300 MB**. Enforce this cap; an unbounded per-session accumulator at
1,200 sessions × 1 hour is 690 GB.

---

## 6. Edge case catalogue

Every entry: **trigger → symptom if unhandled → handling → how we detect it**.
Categories: `CX` transport · `AU` audio · `BF` buffering · `SS` session ·
`IN` inference · `OR` ordering · `SC` security · `OP` operations.

### 6.1 CX — Ingress transport (gateway → bridge)

**CX-01 · Connection opens, no audio ever arrives.**
Half-configured dialplan, or a health-check probe that speaks WebSocket.
*Unhandled:* session slots leak until capacity is exhausted.
*Handling:* idle timer — no frame within 10 s of `session.open` → close (1000),
free state, emit `SESSION_ABANDONED`.
*Detect:* `sessions_abandoned_total`, alert if > 1 % of opens.

**CX-02 · Abrupt TCP reset mid-call (no close frame).**
Gateway crash, NAT rebind, cable pull.
*Unhandled:* session state pinned forever; memory and licence-count leak.
*Handling:* treat any read error as terminal. Finalise session, flush any partial
window as `partial=true`, emit `CALL_ENDED{reason: TRANSPORT_LOST}`.
*Detect:* ratio of `TRANSPORT_LOST` to clean `CALL_ENDED`.

**CX-03 · Half-open connection — peer gone, no FIN.**
The classic. Common with mobile networks and stateful firewalls.
*Unhandled:* the session looks alive forever and holds resources; no audio flows.
*Handling:* application-level ping every 5 s; three consecutive misses (15 s) →
declare dead. TCP keepalive alone is too slow (default 2 h).
*Detect:* `sessions_reaped_by_keepalive_total`.

**CX-04 · Client reconnects with the same `session_id` after a drop.**
*Unhandled:* either a rejected legitimate resume, or double-counted audio that
corrupts `sample_offset` and therefore every window boundary.
*Handling:* resume is accepted only if **all** hold: within a 15 s grace window,
the presented `session_epoch` matches, and the incoming `sample_offset` is
`>=` the last seen. Otherwise start a new session with a fresh epoch and mark
`gap_before=true`. Never blindly append.
*Detect:* `session_resume_total{outcome=accepted|rejected}`.

**CX-05 · Two live connections claim the same `session_id`.**
Gateway retry storm, or a malicious client.
*Unhandled:* two producers write one ring buffer → interleaved garbage audio.
*Handling:* fencing token. Redis `SET session:{id}:epoch <uuid> NX PX 30000`.
The holder wins; the loser is rejected `ALREADY_EXISTS`. Every frame carries its
epoch and is dropped if it does not match the current one.
*Detect:* `session_fence_rejections_total` — any non-zero value is worth a look.

**CX-06 · Sender slower than real time (congestion).**
*Unhandled:* buffer underruns; windows silently stop; looks identical to "call
went quiet", which is a completely different situation.
*Handling:* do **not** fabricate audio. If the timeline gap exceeds 500 ms,
insert explicit `synthetic_silence` frames to keep `sample_offset` honest and
raise `gap_before` on the next window.
*Detect:* `underrun_seconds_total`, `gap_before_windows_total`.

**CX-07 · Sender faster than real time.**
Someone replays a WAV at 100× for testing; or a deliberate resource-exhaustion
attack.
*Unhandled:* ring buffer overruns instantly; one session starves 1,199 others.
*Handling:* per-session token bucket at 1.5× real time. Excess is dropped and
counted, not buffered. Sustained violation closes the session.
*Detect:* `ingress_rate_limited_frames_total`.

**CX-08 · Partial frame at a TCP boundary.**
Applies to **AudioSocket only** — raw TCP has no message boundaries. WebSocket
preserves them.
*Unhandled:* PCM misalignment by one byte → every subsequent sample is
byte-swapped noise. Sounds like loud static; the detector will confidently call
it synthetic.
*Handling:* length-prefixed framing per the AudioSocket spec (1-byte type,
2-byte big-endian length, payload). Accumulate until a complete frame exists.
Never assume one `recv()` equals one frame.
*Detect:* unit test that feeds a stream split at every possible byte offset.

**CX-09 · Oversized inbound message.**
*Handling:* 64 KB cap; exceed → close 1009 (Message Too Big).

**CX-10 · TLS handshake failure / expired certificate.**
*Handling:* **fail closed.** Never fall back to plaintext for call audio.
*Detect:* cert expiry alert at T-30 days; handshake failure rate.

**CX-11 · Unauthenticated connection flood.**
*Handling:* auth token required in the WebSocket subprotocol header, validated
*before* any buffer is allocated. Per-source-IP connection rate limit; global
admission control on concurrent sessions.

### 6.2 CX — Egress transport (bridge → AI engine, gRPC)

**CX-12 · `UNAVAILABLE` — inference pod restarting.**
*Unhandled:* every in-flight call errors out simultaneously during a routine deploy.
*Handling:* retry on a **new stream** with jittered exponential backoff
(50 ms → 2 s). Buffer at most 3 windows during the gap. After 5 s, stop buffering
and enter **L3 degraded** (§7): the call continues, scores stop, status is
explicitly `DETECTOR_UNAVAILABLE`. Never silently emit low risk.
*Detect:* `grpc_stream_restarts_total`, time-in-degraded.

**CX-13 · `DEADLINE_EXCEEDED` on a window.**
*Handling:* per-window deadline of 400 ms. On breach, **abandon that window —
do not retry.** A result that arrives after its window has scrolled off the
timeline is worthless, and the retry steals capacity from fresh windows.
*Detect:* `window_deadline_exceeded_total`.

**CX-14 · HTTP/2 `MAX_CONCURRENT_STREAMS` exhausted.**
Default is 100 streams per connection; we need ~1,200.
*Unhandled:* new sessions block invisibly, queued in the client, presenting as
mysterious latency rather than an error.
*Handling:* connection pool sized `ceil(max_sessions / 80)` with headroom, plus
round-robin session assignment. Monitor streams-per-connection.
*Detect:* `grpc_streams_per_conn` histogram; alert above 80.

**CX-15 · HTTP/2 flow-control window exhaustion.**
*Unhandled:* the stream stalls **silently** — no error, just no throughput.
Extremely hard to diagnose after the fact.
*Handling:* raise the initial window (1 MB+), enable BDP probing.
*Detect:* per-stream throughput floor alarm — bytes/s that drops to zero while
the session is still open.

**CX-16 · Head-of-line blocking across multiplexed streams.**
One slow inference response delays unrelated sessions on the same TCP connection.
*Handling:* cap sessions per connection well below the stream limit; assign
high-value calls (flagged by the risk engine) to a dedicated connection.

**CX-17 · Keepalive too aggressive → `GOAWAY / ENHANCE_YOUR_CALM`.**
*Unhandled:* the server bans our client mid-traffic; looks like a random outage.
*Handling:* client `keepalive_time` must be **≥** the server's
`http2.min_ping_interval_without_data`. Agree the numbers with #3 explicitly and
put them in the shared config, not in two separate files.

**CX-18 · L4 load-balancer idle timeout during a long silence.**
AWS NLB defaults to 350 s. A call on hold with VAD suppressing frames sends
nothing.
*Unhandled:* the LB silently drops a healthy stream mid-call.
*Handling:* application keepalive strictly below the LB idle timeout.

**CX-19 · `GOAWAY` during a rolling deploy.**
*Handling:* finish in-flight windows on the old connection, open new streams on a
new connection, replay only the single window that was in flight. Bounded drain.

**CX-20 · Server half-closes the response stream early.**
*Handling:* treat as end-of-results; finalise the session rather than hanging on
a stream that will never produce another message.

### 6.3 AU — Audio format and content

**AU-01 · Codec mismatch (μ-law vs A-law vs L16).**
μ-law decoded as A-law is intelligible but distorted — it will **not** crash, it
will just quietly degrade accuracy.
*Handling:* `encoding` is a required field in session-open. Unknown value →
reject the session. Never sniff.

**AU-02 · Endianness.**
L16 over RTP is big-endian (network order); several `mod_audio_stream` builds
emit host-order little-endian.
*Unhandled:* byte-swapped PCM is loud white noise. The detector will score it
confidently — and wrongly.
*Handling:* explicit `encoding` (`L16_LE` / `L16_BE`), **plus** a startup
handshake in which the gateway sends a known 1 kHz test tone the bridge
validates. An energy/spectral sanity check catches it in one frame.
*Detect:* per-session first-frame spectral check; reject on failure.

**AU-03 · Sample-rate mismatch (8 k telephony vs 16 k model).**
*Handling:* resample 8 k → 16 k with **soxr VHQ — the identical path used in
training** (`ml/common/audio_utils.py`). A different resampler introduces
different artefacts in exactly the band the model inspects.

**AU-04 · Stereo / dual-leg fork.**
The gateway may fork caller and callee as two channels.
*Unhandled:* averaging the two channels **mixes two speakers into one signal**,
which destroys both the deepfake and speaker-verification signals. This is the
single most damaging silent failure in this list.
*Handling:* mono is mandatory. Two legs arrive as **two sessions** with a shared
`call_id` and distinct `leg` values. Reject 2-channel audio outright; never
average.

**AU-05 · Variable frame duration (10 / 20 / 30 / 40 ms).**
*Handling:* accumulate by sample count. No code path may assume a frame length.

**AU-06 · Inline DTMF (RFC 2833 telephone-event) bleeding into PCM.**
*Handling:* the gateway should strip it. If present, mark the region; DTMF tones
are pure synthetic tones and will read as "spoof" to the detector.

**AU-07 · VAD-suppressed silence — gateway sends nothing at all.**
*Unhandled:* the timeline develops holes; `sample_offset` and wall time diverge;
window boundaries drift out of alignment with the audio.
*Handling:* insert explicit `synthetic_silence` frames to keep the timeline
contiguous, flagged so the windower can skip rather than score them.

**AU-08 · Packet-loss concealment artefacts.**
The gateway *invents* audio to paper over lost packets.
*Unhandled:* **PLC-synthesised audio is literally synthetic** and reads as a
deepfake. This produces false accusations against genuine callers on a bad line —
the exact failure that gets a fraud system switched off in production.
*Handling:* the gateway must set `concealed=true`. Windows containing more than
~15 % concealed samples are either skipped or sent with a down-weight flag so the
risk engine discounts them.
*Detect:* `concealed_sample_ratio` histogram; correlate spikes with score spikes.

**AU-09 · Clock drift between gateway and bridge.**
*Handling:* trust the gateway's `sample_offset` when present. Otherwise correct
slowly against wall clock (< 0.1 % adjustment per minute); never jump.

**AU-10 · Jitter — five frames arrive at once, then a 100 ms gap.**
*Handling:* jitter buffer with 60 ms target depth, adaptive between 20–200 ms
based on observed variance.

**AU-11 · Entirely silent call.**
*Handling:* VAD gate; emit `SKIPPED_SILENCE` rather than a fabricated score.

**AU-12 · Call shorter than one window (< 2 s).**
*Handling:* on session close, emit one final window, tiled to length (never
zero-padded — §`pad_or_crop` in the shared front-end), flagged `partial=true`.
If under 0.5 s, emit `INSUFFICIENT_AUDIO` and no score. Silence here is not an
acceptable answer; downstream must be able to distinguish "too short to judge"
from "pipeline broken".

**AU-13 · Multi-hour call.**
*Handling:* strictly bounded ring; nothing accumulates per session. Verified by a
soak test (§9).

**AU-14 · Mid-call codec or rate change (SIP re-INVITE).**
*Handling:* bump `session_epoch`, flush the ring, restart windowing, set
`gap_before=true`. Do not attempt to resample across the discontinuity.

**AU-15 · Severe DC offset or clipping from a faulty gateway.**
*Handling:* DC removal is already in the shared front-end; clipping is detected
and flagged (a clipped window's score is unreliable).

**AU-16 · All-zero audio (muted leg).**
*Handling:* identical to silence — VAD gate, `SKIPPED_SILENCE`.

### 6.4 BF — Buffering and windowing

**BF-01 · First window before 2 s of audio exists.**
*Handling:* wait. Report `time_to_first_score` as an explicit SLI (~2.4 s).

**BF-02 · Hop size does not divide the frame size.**
*Handling:* sample-accurate ring; hop by samples, never by frames.

**BF-03 · Ring overflow — inference slower than real time. ⚠ THE critical case.**
There is no upstream to push back on.
*Handling:* a strict ladder, applied per session:
1. **Drop oldest** windows, never newest — freshness beats completeness for a
   live fraud decision.
2. **Adaptive hop**: 100 ms → 200 ms → 500 ms, reducing score cadence rather than
   losing the call entirely.
3. Emit `status=DEGRADED` so the risk engine widens its confidence band.
4. The ingest path **never blocks**, under any circumstances.
*Detect:* `ring_drop_total`, `effective_hop_ms` gauge.

**BF-04 · Window length must equal the model's `segment_samples`.**
*Handling:* the bridge reads the window length **from the model checkpoint's
front-end config**, not from its own constant. Two sources of truth here is a
silent accuracy bug — the same class of failure the training pipeline was built
to avoid.

**BF-05 · Per-session memory bound.** 256 KB ring; enforced and asserted.

**BF-06 · Node at capacity.**
*Handling:* admission control — reject *new* sessions with `RESOURCE_EXHAUSTED`
so the gateway can route elsewhere. Degrading all 1,200 existing calls to protect
one new one is the wrong trade.

### 6.5 SS — Session and state

**SS-01 · Redis unavailable.**
*Handling:* **split behaviour by concern.** Liveness fails *open* — in-flight
calls continue on local state, because dropping every live call because a cache
is down is worse than losing cross-pod coordination. Consent fails **closed** —
if we cannot verify consent, we do not process audio (§SC-01).

**SS-02 · Session TTL expires mid-call during a long silence.**
*Handling:* refresh TTL on every window **and** every keepalive, not only at
creation.

**SS-03 · Two pods serve one session (no sticky routing).**
*Handling:* consistent-hash routing on `session_id` at the LB, plus the Redis
fencing token (§CX-05) as the authoritative tie-break. Do not rely on the LB alone.

**SS-04 · Pod crash leaves orphaned state.**
*Handling:* every key carries a TTL; a reaper sweeps sessions whose heartbeat has
lapsed.

**SS-05 · `session_id` spoofing or collision.**
*Handling:* IDs are server-issued opaque values or HMAC-signed by the gateway
with a shared key. Never trust a raw client-supplied identifier — it addresses
another customer's call.

**SS-06 · Speaker enrolment reference missing.**
*Unhandled:* a missing reference yields similarity 0.0, which the fusion engine
reads as "total mismatch" and inflates risk — **fabricating fraud signal for
every non-enrolled caller.**
*Handling:* emit `asv_similarity = null` with an explicit
`speaker_signal=UNAVAILABLE`. The risk engine must renormalise its weights over
the available signals, not substitute a zero.

### 6.6 IN — Inference interaction

**IN-01 · Inference slower than hop.** → §BF-03.

**IN-02 · A single window errors.**
*Handling:* skip it, count it, keep the call alive. If the error rate exceeds
20 % over 10 s, escalate to L2 degraded.

**IN-03 · Model hot-swap mid-call.**
*Unhandled:* two model versions' score distributions get averaged inside one
call's smoothing window — a silent, unfalsifiable accuracy bug.
*Handling:* `model_version` on every result; the risk engine resets smoothing on
change; the bridge logs the transition.

**IN-04 · NaN or out-of-range score.**
*Handling:* reject the result, count it, alert. Never clamp silently — a NaN
means something upstream is broken and clamping hides it.

**IN-05 · Result arrives for an ended session.**
*Handling:* drop, count `late_result_total`.

**IN-06 · Results return out of order (parallel inference workers).**
*Handling:* reorder buffer keyed on `window_seq`, bounded wait of 300 ms, then
emit with `gap_before` on whatever is missing. This is why `window_seq` **must**
be echoed in the response.

### 6.7 OR — Ordering and time

**OR-01 · Authoritative timestamp.** `sample_offset`. Wall clock is for SLA
measurement only.
**OR-02 · Monotonic `window_seq`** per session; the risk engine deduplicates on it.
**OR-03 · A late result arrives after a newer one was already emitted.**
*Handling:* drop it. The timeline must never regress — a dashboard that shows
risk going backwards destroys operator trust faster than being briefly wrong.
**OR-04 · Sequence gaps** are signalled explicitly (`gap_before`) so downstream
smoothing does not treat discontinuous windows as adjacent.

### 6.8 SC — Security and DPDP compliance

**SC-01 · Consent absent.** No consent flag → **no audio leaves the bridge.**
Fail closed. Emit `CONSENT_MISSING` and terminate the analysis session (the call
itself is unaffected). This is a statutory requirement, not a feature toggle.

**SC-02 · Raw PCM must never reach disk.** No debug dumps in production builds;
buffers zeroed on release; core dumps disabled on the audio path; no swap-backed
allocation where it can be avoided. Only derived features and scores persist.

**SC-03 · mTLS on both hops** (gateway↔bridge, bridge↔inference).

**SC-04 · Metadata redaction.** Phone numbers, account IDs and similar are hashed
before they touch a log line or a metric label.

**SC-05 · Audit trail without audio.** Record *that* analysis happened —
timestamps, window counts, scores, model version — never the audio itself.

**SC-06 · Retention.** Embeddings and scores only. A voice embedding is not
reversible to intelligible audio; raw PCM is.

**SC-07 · Multi-tenant isolation.** Every session, metric and log line is scoped
by `tenant_id`. Cross-tenant leakage of a fraud signal is itself a breach.

### 6.9 OP — Operations

**OP-01 · Graceful shutdown.** Stop accepting new sessions; drain existing for up
to 60 s; then force-close with `CALL_ENDED{reason: SHUTDOWN}`.

**OP-02 · Rolling deploy with live streams.** → §CX-19.

**OP-03 · Metrics cardinality.** **Never** label a metric with `session_id`.
1,200 concurrent calls × several metrics destroys Prometheus. Session-level
detail belongs in traces, sampled.

**OP-04 · Per-stage latency instrumentation.** Every stage in §4 is measured
separately; a single end-to-end number cannot tell you which stage regressed.

**OP-05 · Capacity and admission control.** Derive max sessions per pod from
measured CPU and memory headroom; enforce it (§BF-06).

**OP-06 · Clock skew between pods.** All durations use a monotonic clock; wall
clock is never subtracted from wall clock across hosts.

---

## 7. Degradation ladder

The governing rule, stated once and applied everywhere:

> **Absence of a score is never equivalent to a low score.**
> A detector that cannot answer must say so. Reporting "genuine" when the
> pipeline is broken is the only failure mode in this system that actively
> causes harm — it green-lights the fraud we were built to stop.

| Level | Trigger | Behaviour | Downstream sees |
|---|---|---|---|
| **L0 Normal** | — | 2 s window / 100 ms hop, full cadence | `status=OK` |
| **L1 Elevated** | queue depth > 2 windows, or p95 latency > 350 ms | hop widens 100 → 200 ms | `status=OK`, lower cadence |
| **L2 Degraded** | ring drops occurring, or window error rate > 20 % | hop 500 ms, drop-oldest active | `status=DEGRADED` — risk engine widens confidence band |
| **L3 Detector down** | gRPC unavailable > 5 s | audio path stays up, scoring stops | `status=DETECTOR_UNAVAILABLE` — risk engine falls back to non-audio signals and **flags the call as unverified**, never as safe |
| **L4 Shedding** | node at capacity | new sessions rejected `RESOURCE_EXHAUSTED` | gateway reroutes; existing calls unaffected |

Transitions are hysteretic — a level is entered on breach but only exited after
10 s of sustained health, so the system does not oscillate.

---

## 8. Observability

**RED metrics per stage** (rate / errors / duration), plus:

| Metric | Type | Alert |
|---|---|---|
| `bridge_sessions_active` | gauge | > 90 % capacity |
| `bridge_e2e_latency_ms` | histogram | p95 > 450 ms |
| `bridge_stage_latency_ms{stage}` | histogram | per §4 budget |
| `bridge_time_to_first_score_ms` | histogram | p95 > 2800 ms |
| `bridge_ring_drop_total` | counter | any sustained rate |
| `bridge_effective_hop_ms` | gauge | > 100 ms |
| `bridge_degradation_level` | gauge | ≥ 2 |
| `bridge_concealed_sample_ratio` | histogram | p95 > 0.15 |
| `bridge_grpc_stream_restarts_total` | counter | spike |
| `bridge_session_fence_rejections_total` | counter | any |
| `bridge_consent_missing_total` | counter | any |
| `bridge_windows_skipped_silence_total` | counter | ratio sanity |

**Tracing.** One span per window, sampled at ~1 % (100 % for sessions the risk
engine flags high-risk), with the stage breakdown attached. Traces carry
`session_id`; metrics never do (§OP-03).

**The one dashboard panel that matters:** a stacked latency breakdown by stage.
When someone reports "detection feels slow", this answers *which component*
in under five seconds — without it, four people each assume it is one of the
other three.

---

## 9. Test plan

Nothing here requires the real telephony stack or the real model. All of it is
runnable on a laptop, which is the point — this component must be verifiable
independently of the other three.

### 9.1 Unit — deterministic, no network

| Test | Asserts |
|---|---|
| Frame splitter fuzz | AudioSocket stream split at **every** byte offset reassembles identically (§CX-08) |
| Endianness detector | byte-swapped L16 is rejected on the first frame (§AU-02) |
| Ring buffer invariants | never exceeds cap; drop-oldest ordering; sample-accurate hop (§BF-02/03/05) |
| Window alignment | window length equals the checkpoint's `segment_samples` (§BF-04) |
| `sample_offset` monotonicity | survives gaps, resumes, epoch bumps (§3.2) |
| Reorder buffer | shuffled `window_seq` emerges ordered; missing seq → `gap_before` (§IN-06) |
| Resume logic | truth table over all CX-04 conditions |
| Fencing | second claimant rejected (§CX-05) |
| Consent gate | no consent → zero bytes forwarded, asserted at the transport mock (§SC-01) |
| Short call | 1.2 s call → one `partial=true` window; 0.3 s → `INSUFFICIENT_AUDIO` (§AU-12) |

### 9.2 Integration — fake gateway + fake inference

A **replay harness** that plays a WAV through the real ingress path at
controllable rate, jitter and loss, against a mock gRPC server with programmable
latency and failure injection.

| Scenario | Expected |
|---|---|
| Clean 60 s call | continuous scores, p95 e2e < 450 ms, zero drops |
| Inference at 400 ms/window | L1 → L2 escalation, hop widens, no ingest blocking |
| Inference killed mid-call | L3 within 5 s, `DETECTOR_UNAVAILABLE`, call survives, auto-recovery on restart |
| 30 % packet loss with PLC | `concealed` windows flagged; **false-positive rate does not rise** (§AU-08) |
| Network drop at t=20 s, reconnect at t=25 s | resume accepted, `gap_before` set, `sample_offset` continuous |
| Two connections, one `session_id` | second rejected, first unaffected |
| Codec/rate change mid-stream | epoch bump, clean restart, no resampling across the seam |
| 8 kHz μ-law end-to-end | output bit-identical to the offline front-end on the same source |

The last row is the highest-value test in the entire plan: it proves the live
path and the training path produce **the same tensor**. Train/serve skew is
invisible in every other test and fatal in production.

### 9.3 Load and soak

- **Load:** ramp to 1,200 concurrent synthetic sessions; hold 30 min. Watch
  p95 latency, ring drops, streams-per-connection, GC pauses.
- **Soak:** 200 sessions for 8 hours. **Memory must be flat.** Any upward slope
  is a per-session leak that will kill a production node in a day.
- **Chaos:** randomly kill inference pods, sever Redis, expire certificates,
  inject `GOAWAY`, saturate the NIC — during load.

### 9.4 The bar for "done"

1. Every edge case in §6 has a test that fails when its handling is removed.
2. 1,200 concurrent sessions sustained for 30 min inside the latency budget.
3. 8-hour soak with flat memory.
4. Live path and offline front-end produce identical tensors on the same input.
5. No path exists by which a broken pipeline reports low risk.

---

## 10. Implementation order

Deliberately sequenced so that something demonstrable exists early and the
riskiest unknowns are retired first.

| Step | Deliverable | Why here |
|---|---|---|
| 1 | Frozen `.proto`, agreed with #1 and #3 | Everything else depends on it; changing it later costs all four people |
| 2 | Canonical frame + ring buffer + windower, with unit tests | Pure logic, no I/O, fully testable in isolation |
| 3 | Replay harness + mock gRPC server | The test rig must exist before the thing it tests |
| 4 | WebSocket ingress (FreeSWITCH L16 path) | The primary transport; unblocks #1 |
| 5 | gRPC client with pooling, retry, deadlines | Unblocks #3 |
| 6 | Session manager, Redis fencing, consent gate | Correctness and compliance |
| 7 | Reorder + fan-out to risk engine | Unblocks #4 |
| 8 | Degradation ladder + admission control | Only meaningful once load exists |
| 9 | Twilio and AudioSocket adapters | Additional transports, not on the critical path |
| 10 | Load, soak, chaos | Final gate |

**Steps 1–3 are the whole game.** With a frozen contract and a replay harness,
this component can be built and proven while the other three are still in
progress — and integration day becomes a formality instead of a discovery
exercise.

---

## 11. Open questions for the team

1. **#1 (Gateway):** does your `mod_audio_stream` build emit L16 big- or
   little-endian? Can it populate `sample_offset` and a `concealed` flag, or must
   the bridge infer both?
2. **#1:** dual-leg forking — two sessions or one two-channel stream? (The answer
   must be two sessions; §AU-04.)
3. **#3 (AI/DSP):** who owns VAD — bridge or engine? Owning it in the bridge
   saves ~40 % of inference cost, but only if we use the same VAD the engine
   would have.
4. **#3:** confirm `window_seq` and `model_version` are echoed on every response.
   Without them, §IN-03 and §IN-06 are unsolvable on my side.
5. **#4 (Risk):** on `DETECTOR_UNAVAILABLE`, does the fusion engine renormalise
   over remaining signals, or hold the last score? It must not treat a missing
   signal as a zero (§SS-06).
6. **All:** where does the consent flag originate — IVR, CRM, or SIP header?
