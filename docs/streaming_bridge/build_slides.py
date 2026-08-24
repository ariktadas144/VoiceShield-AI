"""Build the 3 review slides for the Streaming Middleware Bridge.

Everything is a NATIVE PowerPoint shape — rounded rectangles, connectors and
text runs. No raster images. Every box, arrow and word can be clicked and
edited directly in PowerPoint.

The hand-drawn look uses PowerPoint's own sketch line style (the 2018
"sketchyshapes" extension, PPT 2019+/365). Consumers that don't understand the
extension ignore it and render a clean line, so it degrades safely.

Re-run after editing:  .venv/bin/python docs/streaming_bridge/build_slides.py
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

# ── palette (Excalidraw defaults) ──────────────────────────────────────────
INK  = RGBColor(0x1E,0x1E,0x1E); MUT = RGBColor(0x5C,0x56,0x50)
BLUE = RGBColor(0x19,0x71,0xC2); BLUEF = RGBColor(0xA5,0xD8,0xFF); BLUEP = RGBColor(0xE7,0xF2,0xFC)
RED  = RGBColor(0xE0,0x31,0x31); REDF  = RGBColor(0xFF,0xC9,0xC9); REDP  = RGBColor(0xFF,0xF0,0xEF)
GRN  = RGBColor(0x2F,0x9E,0x44); GRNF  = RGBColor(0xB2,0xF2,0xBB); GRNP  = RGBColor(0xEE,0xFB,0xF1)
AMB  = RGBColor(0xF0,0x8C,0x00); AMBF  = RGBColor(0xFF,0xEC,0x99); AMBP  = RGBColor(0xFF,0xF8,0xE6)
VIO  = RGBColor(0x9C,0x36,0xB5); VIOF  = RGBColor(0xEE,0xBE,0xFA); VIOP  = RGBColor(0xF8,0xEF,0xFB)
PANEL= RGBColor(0xF5,0xF2,0xEC); WHITE= RGBColor(0xFF,0xFF,0xFF)
F = "Arial"
SKNS = "http://schemas.microsoft.com/office/drawing/2018/sketchyshapes"
_seed = [1799159648]

def sketchy(shape, kind="lineSketchFreehand"):
    """PowerPoint-native hand-drawn outline. Must be appended after tailEnd."""
    ln = shape.line._get_or_add_ln()
    ext_lst = ln.find(qn('a:extLst'))
    if ext_lst is None:
        ext_lst = etree.SubElement(ln, qn('a:extLst'))
    ext = etree.SubElement(ext_lst, qn('a:ext'))
    ext.set('uri', '{C807C97D-BFC1-408E-A445-0C87EB9F89A2}')
    p = etree.SubElement(ext, '{%s}lineSketchStyleProps' % SKNS)
    _seed[0] += 7919
    p.set('sd', str(_seed[0]))
    t = etree.SubElement(p, '{%s}type' % SKNS)
    etree.SubElement(t, '{%s}%s' % (SKNS, kind))
    return shape

def box(s, x, y, w, h, line=INK, fill=WHITE, lw=2.0, radius=0.05, sketch=True):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb = fill
    sh.line.color.rgb = line; sh.line.width = Pt(lw)
    sh.shadow.inherit = False
    try: sh.adjustments[0] = radius
    except Exception: pass
    tf = sh.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(0.10); tf.margin_right = Inches(0.10)
    tf.margin_top = Inches(0.06); tf.margin_bottom = Inches(0.06)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    if sketch: sketchy(sh)
    return sh

def fill_text(shape, blocks, align=None):
    """blocks = [(text, size, bold, color, space_before_pt), ...]"""
    tf = shape.text_frame
    tf.paragraphs[0].text = ""
    for i, (txt, size, bold, color, sb) in enumerate(blocks):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if sb: p.space_before = Pt(sb)
        if align is not None: p.alignment = align
        r = p.add_run(); r.text = txt
        r.font.size = Pt(size); r.font.bold = bold
        r.font.color.rgb = color; r.font.name = F
    return shape

def tbox(s, x, y, w, h, anchor=MSO_ANCHOR.TOP):
    b = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = b.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    return b

def rich(shape, blocks, align=None):
    """blocks = [[(text,size,bold,color), ...], ...]  one inner list per paragraph"""
    tf = shape.text_frame
    tf.paragraphs[0].text = ""
    for i, runs in enumerate(blocks):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if align is not None: p.alignment = align
        for (txt, size, bold, color) in runs:
            r = p.add_run(); r.text = txt
            r.font.size = Pt(size); r.font.bold = bold
            r.font.color.rgb = color; r.font.name = F
    return shape

def arrow(s, x1, y1, x2, y2, color=INK, lw=2.0):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color; c.line.width = Pt(lw)
    ln = c.line._get_or_add_ln()
    te = etree.SubElement(ln, qn('a:tailEnd'))
    te.set('type', 'triangle'); te.set('w', 'med'); te.set('len', 'med')
    return c

def label(s, x, y, w, txt, size=8.5, color=MUT, bold=False):
    b = tbox(s, x, y, w, 0.18)
    p = b.text_frame.paragraphs[0]
    from pptx.enum.text import PP_ALIGN
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = txt
    r.font.size = Pt(size); r.font.bold = bold; r.font.color.rgb = color; r.font.name = F
    return b

def title_block(s, title, accent_tail, sub):
    b = tbox(s, 0.42, 0.16, 12.5, 0.44)
    p = b.text_frame.paragraphs[0]
    for txt, bold, col, size in [(title, True, INK, 25), (accent_tail, False, BLUE, 25)]:
        r = p.add_run(); r.text = txt; r.font.size = Pt(size)
        r.font.bold = bold; r.font.color.rgb = col; r.font.name = F
    b2 = tbox(s, 0.42, 0.62, 12.5, 0.26)
    r = b2.text_frame.paragraphs[0].add_run(); r.text = sub
    r.font.size = Pt(11); r.font.color.rgb = MUT; r.font.name = F

prs = Presentation(); prs.slide_width = Emu(12192000); prs.slide_height = Emu(6858000)
BLANK = prs.slide_layouts[6]
print("built helpers")

# ══════════════════════════════════════════════════════════════════════════
# SLIDE 1 — Role & Interfaces
# ══════════════════════════════════════════════════════════════════════════
s1 = prs.slides.add_slide(BLANK)
title_block(s1, "Streaming Middleware Bridge (gRPC)", "  —  Component 2 of 4",
  "The only stateful, real-time component. Turns live forked call audio into scored analysis windows inside a 500 ms budget, "
  "for ~1,200 concurrent calls — on a stream that cannot be paused.")

# --- context row: four big components -------------------------------------
CY, CH = 0.98, 2.62
b1 = box(s1, 0.42, CY, 2.75, CH, INK, PANEL, 2.0)
fill_text(b1, [
  ("(1) TELEPHONY &", 14.5, True, INK, 0), ("MEDIA GATEWAY", 14.5, True, INK, 0),
  ("FreeSWITCH + mod_audio_stream", 9, False, MUT, 7),
  ("SIP / RTP · forks call audio", 8.5, False, MUT, 1),
  ("thread-isolated per channel", 8.5, False, MUT, 1)])

b2 = box(s1, 3.59, 0.86, 3.20, CH + 0.26, BLUE, BLUEF, 3.25)
fill_text(b2, [
  ("(2) STREAMING BRIDGE", 16, True, BLUE, 0), ("gRPC", 16, True, BLUE, 0),
  ("MY COMPONENT", 9, True, BLUE, 5),
  ("normalise · session state ·", 8.5, False, INK, 4),
  ("buffer · window · transport", 8.5, False, INK, 1),
  ("reorder · fan-out · degrade", 8.5, False, INK, 1)])

b3 = box(s1, 7.21, CY, 2.75, CH, INK, PANEL, 2.0)
fill_text(b3, [
  ("(3) AI & DSP ENGINE", 14.5, True, INK, 0),
  ("WavLM + LFCC/MGD fusion", 8.5, False, MUT, 5),
  ("Silero VAD · ECAPA-TDNN", 8.5, False, MUT, 1),
  ("RTF <= 0.1 target", 8.5, False, MUT, 1),
  ("dev EER 0.55% (in-domain)", 8.5, False, MUT, 1)])

b4 = box(s1, 10.38, CY, 2.53, CH, INK, PANEL, 2.0)
fill_text(b4, [
  ("(4) RISK ENGINE", 14.5, True, INK, 0), ("+ DASHBOARD", 14.5, True, INK, 0),
  ("weighted multi-signal fusion", 8.5, False, MUT, 5),
  ("dynamic thresholds", 8.5, False, MUT, 1),
  ("prevention + CRM webhooks", 8.5, False, MUT, 1)])

MY = CY + CH / 2
arrow(s1, 3.17, MY, 3.55, MY, INK, 2.25)
label(s1, 2.96, MY - 0.30, 0.80, "WS · L16")
arrow(s1, 6.83, MY - 0.18, 7.17, MY - 0.18, INK, 2.25)
label(s1, 6.62, MY - 0.48, 0.80, "windows")
arrow(s1, 7.17, MY + 0.22, 6.83, MY + 0.22, VIO, 2.25)
label(s1, 6.62, MY + 0.28, 0.80, "scores", 8.5, VIO)
arrow(s1, 9.96, MY, 10.34, MY, INK, 2.25)
label(s1, 9.75, MY - 0.30, 0.80, "results")

# --- interface contracts ---------------------------------------------------
hdr = tbox(s1, 0.42, 3.80, 12.5, 0.24)
rich(hdr, [[("FOUR INTERFACE CONTRACTS", 10, True, BLUE),
            ("   — agree these before anyone writes code; changing one later costs all four of us", 9.5, False, MUT)]])

contracts = [
 (BLUE, BLUEP, "CONTRACT A", "Gateway  ->  Bridge",
  [("session_id", "server-issued or HMAC-signed"), ("encoding", "L16_LE / L16_BE / PCMU / PCMA"),
   ("sample_rate", "8000 or 16000 — never assumed"), ("channels + leg", "mono only; 2 legs = 2 sessions"),
   ("sample_offset", "the authoritative clock"), ("concealed", "true if gateway invented the audio"),
   ("consent", "DPDP gate — no consent, no audio"),
   ("", ""),
   ("OPEN Q", "is your L16 big- or little-endian?"),
   ("", "Byte-swapped PCM is loud noise, and"), ("", "the detector will confidently call it"),
   ("", "synthetic. Validated by a 1 kHz test"), ("", "tone in the session-open handshake.")]),
 (VIO, VIOP, "CONTRACT B", "Bridge  <->  AI Engine (gRPC)",
  [("AudioChunk", "pcm, window_seq, sample_offset"), ("", "gap_before, partial, session_epoch"),
   ("RiskScoreUpdate", "window_seq ECHOED back"), ("", "model_version, status"),
   ("why echoed", "out-of-order results are otherwise"), ("", "unrecoverable on my side"),
   ("batch", "always 1 — Dhwani collapses batches"),
   ("", ""),
   ("deadline", "400 ms per window; on breach the"),
   ("", "window is ABANDONED, never retried —"), ("", "a late score is worthless and the"),
   ("", "retry steals capacity from fresh audio."),
   ("pooling", "80 streams/conn (HTTP/2 caps at 100)")]),
 (GRN, GRNP, "CONTRACT C", "Bridge  ->  Risk Engine",
  [("ordering", "monotonic window_seq, deduplicated"), ("gaps", "gap_before=true resets smoothing"),
   ("status", "OK / SKIPPED_SILENCE / DEGRADED"), ("", "/ DETECTOR_UNAVAILABLE"),
   ("critical", "a missing signal must renormalise,"), ("", "never be substituted with 0.0"),
   ("model_version", "never mix versions in one call"),
   ("", ""),
   ("OPEN Q", "on DETECTOR_UNAVAILABLE, do you"),
   ("", "renormalise over remaining signals or"), ("", "hold the last score? Treating a missing"),
   ("", "signal as 0.0 fabricates fraud signal."),
   ("cadence", "10 scores/sec at L0, fewer when degraded")]),
 (AMB, AMBP, "CONTRACT D", "Bridge  ->  Dashboard",
  [("transport", "best-effort WebSocket"), ("delivery", "lossy by design"),
   ("rule", "never in the critical path"), ("", "must never apply backpressure"),
   ("", "that reaches the audio path"), ("reconnect", "client resumes, no server state"),
   ("cardinality", "no per-session metric labels"),
   ("", ""),
   ("why lossy", "a dashboard that can slow the audio"),
   ("", "path is a dashboard that can drop"), ("", "fraud detection. It gets best-effort"),
   ("", "delivery and no guarantees, forever."),
   ("payload", "score, status, model_version, seq")]),
]
x = 0.42
for ln_c, fl_c, cid, who, rows in contracts:
    c = box(s1, x, 4.06, 2.98, 2.06, ln_c, fl_c, 2.0)
    c.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    blocks = [[(cid, 9.5, True, ln_c)], [(who, 10, True, INK)]]
    for k, v in rows:
        blocks.append([(k + "  ", 8, True, INK)] if k else [("", 8, False, INK)])
        blocks[-1].append((v, 8, False, MUT))
    rich(c, blocks)
    x += 3.14

cc = box(s1, 0.42, 6.26, 12.49, 0.64, RED, REDP, 2.0)
rich(cc, [[("CORE CONSTRAINT   ", 10, True, RED),
           ("Every other service in this system can tell its upstream to slow down. A phone call cannot be paused.", 10, False, INK)],
          [("Everything else — the ring buffer, the drop-oldest policy, the adaptive hop, the whole degradation ladder — is a consequence of that one fact.", 9.5, False, MUT)]])
print("slide 1 done")

# ══════════════════════════════════════════════════════════════════════════
# SLIDE 2 — Internal pipeline
# ══════════════════════════════════════════════════════════════════════════
s2 = prs.slides.add_slide(BLANK)
title_block(s2, "Inside the Bridge", "  —  Eight Stages, One Timeline",
  "N dissimilar transports become one canonical PCM timeline; that timeline becomes fixed windows the model was trained to expect.")

# --- ingress sources -------------------------------------------------------
ing = [("FreeSWITCH", "WebSocket · L16 binary", "8 or 16 kHz · primary path"),
       ("Asterisk", "TCP · AudioSocket", "length-prefixed framing"),
       ("Twilio", "WSS · base64 JSON", "G.711 mu-law 8 kHz")]
iy = 1.16
for nm, l2, l3 in ing:
    bb = box(s2, 0.42, iy, 2.10, 0.94, INK, WHITE, 1.75)
    fill_text(bb, [(nm, 11, True, INK, 0), (l2, 7.5, False, MUT, 2), (l3, 7.5, False, MUT, 0)])
    iy += 1.06

# --- main pipeline stages --------------------------------------------------
stages = [
 ("INGRESS\nADAPTERS", BLUE, BLUEF, [("N formats -> 1 frame", True), ("decode · mono · 16 kHz", False),
   ("soxr VHQ resample", False), ("endianness validated", False), ("identical to training path", False)]),
 ("SESSION\nMANAGER", BLUE, BLUEF, [("lifecycle + fencing", True), ("Redis epoch token", False),
   ("consent gate (DPDP)", False), ("resume within 15 s", False), ("2nd claimant rejected", False)]),
 ("RING\nBUFFER", BLUE, BLUEF, [("bounded 256 KB", True), ("jitter absorb 60 ms", False),
   ("drop OLDEST on full", False), ("never blocks ingest", False), ("1 producer, 1 consumer", False)]),
 ("WINDOWER", BLUE, BLUEF, [("2.0 s / 100 ms hop", True), ("sample-accurate", False),
   ("VAD-gated (~40% saved)", False), ("len from checkpoint", False), ("hop by samples, not frames", False)]),
 ("gRPC\nPOOL", VIO, VIOF, [("bidi stream, batch=1", True), ("conn pool: 80 streams", False),
   ("400 ms deadline", False), ("retry on NEW stream", False), ("keepalive < LB idle", False)]),
]
sx, sy, sw, sh_ = 2.96, 1.16, 1.83, 2.00
centers = []
for i, (nm, ln_c, fl_c, rows) in enumerate(stages):
    b = box(s2, sx, sy, sw, sh_, ln_c, fl_c, 2.75)
    b.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    blocks = [[(l, 10.5, True, ln_c)] for l in nm.split("\n")]
    for txt, bold in rows:
        blocks.append([(txt, 7.5, bold, INK if bold else MUT)])
    rich(b, blocks)
    centers.append(sx + sw / 2)
    if i < len(stages) - 1:
        arrow(s2, sx + sw + 0.02, sy + sh_ / 2, sx + sw + 0.18, sy + sh_ / 2, INK, 2.25)
    sx += sw + 0.20

for k in range(3):
    arrow(s2, 2.54, 1.63 + k * 1.06, 2.92, 2.16, INK, 1.75)

# --- return path -----------------------------------------------------------
ret = [("REORDER", "by window_seq", "300 ms bounded wait", BLUE, BLUEF),
       ("FAN-OUT", "dedupe · annotate gaps", "risk / dash / CRM", BLUE, BLUEF),
       ("(4) RISK ENGINE", "weighted fusion", "prevention actions", INK, PANEL)]
rx = 11.08
for nm, l2, l3, ln_c, fl_c in ret:
    rb = box(s2, rx, 3.46, 1.83, 1.00, ln_c, fl_c, 2.25)
    fill_text(rb, [(nm, 10, True, ln_c if ln_c != INK else INK, 0), (l2, 7.5, False, MUT, 2), (l3, 7.5, False, MUT, 0)])
    rx -= 2.23
arrow(s2, 11.995, 3.20, 11.995, 3.42, VIO, 2.25)
arrow(s2, 11.04, 3.96, 10.75, 3.96, VIO, 2.25)
arrow(s2, 8.81, 3.96, 8.52, 3.96, VIO, 2.25)
label(s2, 12.06, 3.20, 0.85, "scores", 8.5, VIO)

# --- design decisions ------------------------------------------------------
hdr2 = tbox(s2, 0.42, 4.68, 12.5, 0.24)
rich(hdr2, [[("THREE DECISIONS THAT DETERMINE WHETHER THIS SCALES", 10, True, BLUE)]])

dec = [
 (BLUE, BLUEP, "CONCURRENCY", "One asyncio loop. No per-session threads.",
  "1,200 threads costs ~9.6 GB of stack before any audio is buffered, and collapses on context switching. Sessions are coroutines; each ring has exactly one producer and one consumer, so it needs no lock.",
  "CPU work (resample, VAD) runs in a process pool — a 5 ms block on the loop x 1,200 sessions is 300 s of stall per second.",
  "Verified by: 1,200 concurrent sessions held for 30 min inside the latency budget."),
 (VIO, VIOP, "THE CLOCK", "sample_offset is authoritative — not wall time.",
  "Wall clocks drift, jump on NTP, and differ per pod. A gateway running at 8000.5 Hz against an assumed 8000 Hz accumulates 1.8 s of error per hour.",
  "Windowing must be reproducible: the same audio must produce the same windows regardless of when packets happened to arrive. Wall clock is used only to measure the SLA.",
  "Verified by: sample_offset stays monotonic across an injected 300 ms gap and a reconnect."),
 (GRN, GRNP, "MEMORY", "256 KB per session, enforced.",
  "4 s ring x 16 kHz x 4 bytes = 256 KB. At 1,200 concurrent sessions that is ~300 MB — comfortable.",
  "The same design with an unbounded per-session accumulator over a 1-hour call would be 690 GB.",
  "Verified by: 8-hour soak at 200 sessions — any upward memory slope is a per-session leak."),
]
dx = 0.42
for ln_c, fl_c, tag, headline, body, extra, sting in dec:
    d = box(s2, dx, 4.94, 4.06, 1.96, ln_c, fl_c, 2.0)
    d.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    rich(d, [[(tag, 9, True, ln_c)], [(headline, 10, True, INK)],
             [(body, 8, False, INK)], [(extra, 8, False, MUT)], [(sting, 8, True, ln_c)]])
    dx += 4.22
print("slide 2 done")

# ══════════════════════════════════════════════════════════════════════════
# SLIDE 3 — Latency, degradation, silent failures
# ══════════════════════════════════════════════════════════════════════════
s3 = prs.slides.add_slide(BLANK)
title_block(s3, "Latency, Failure Handling", "  &  the Edge Cases That Fail Silently",
  "Most failures are loud, and therefore cheap. The expensive ones produce plausible-looking numbers that are wrong.")

# --- latency budget: to-scale stacked bar ---------------------------------
lb = tbox(s3, 0.42, 0.98, 6.2, 0.22)
rich(lb, [[("500 ms END-TO-END SLA", 9.5, True, INK), ("   caller speaks -> score delivered", 8.5, False, MUT)]])

seg = [("gateway", 30, PANEL, INK), ("ingest", 5, PANEL, INK), ("jitter buf", 60, GRNF, GRN),
       ("window fill", 100, BLUEF, BLUE), ("grpc", 10, PANEL, INK), ("inference (3)", 200, VIOF, VIO),
       ("reorder", 20, BLUEF, BLUE), ("fan-out", 10, PANEL, INK), ("slack", 65, AMBF, AMB)]
BAR_X, BAR_Y, BAR_W, BAR_H = 0.42, 1.24, 6.16, 0.62
cx = BAR_X
for nm, ms, fl_c, ln_c in seg:
    w = BAR_W * ms / 500.0
    sb = box(s3, cx, BAR_Y, w, BAR_H, ln_c, fl_c, 1.5, radius=0.02)
    if w > 0.42:
        fill_text(sb, [(str(ms), 9, True, INK, 0)])
    cx += w

lg = tbox(s3, 0.42, 1.96, 6.16, 0.86)
rich(lg, [
  [("jitter buffer 60 ms", 8, True, GRN), ("  ·  ", 8, False, MUT), ("window fill 100 ms", 8, True, BLUE),
   ("  ·  ", 8, False, MUT), ("inference 200 ms", 8, True, VIO), ("  ·  ", 8, False, MUT), ("slack 65 ms", 8, True, AMB)],
  [("Inference is 46% of the entire budget — so jitter-buffer depth is my single biggest lever before I must start dropping windows.", 8.5, False, INK)],
  [("Every stage is measured separately. One end-to-end number cannot tell you which of the four of us regressed, and each of us will assume it was one of the other three.", 8.5, False, MUT)],
  [("Time-to-first-score is ~2.4 s, not 500 ms — a full 2 s window must exist before anything can be scored.", 8.5, True, RED)]])

op = box(s3, 0.42, 2.92, 6.16, 1.10, GRN, GRNP, 2.0)
op.text_frame.vertical_anchor = MSO_ANCHOR.TOP
rich(op, [
 [("OPERATING-POINT TARGETS", 9, True, GRN), ("   reported by name, not as an abstract EER", 8, False, MUT)],
 [("FAR < 1.5%", 8.5, True, INK), ("  synthetic voices that get through        ", 8, False, MUT),
  ("FRR < 3.0%", 8.5, True, INK), ("  genuine callers wrongly flagged", 8, False, MUT)],
 [("RTF <= 0.1", 8.5, True, INK), ("  1 s of audio processed in <= 100 ms      ", 8, False, MUT),
  ("E2E < 500 ms", 8.5, True, INK), ("  conversational turn-taking budget", 8, False, MUT)],
 [("Current fusion model measures FAR 0.55% / FRR 0.55% in-domain — both inside target, but not yet validated out-of-domain.", 8, False, MUT)]])

# --- degradation ladder ----------------------------------------------------
db = tbox(s3, 6.90, 0.98, 6.0, 0.22)
rich(db, [[("DEGRADATION LADDER", 9.5, True, INK), ("   hysteretic: exit only after 10 s of health", 8.5, False, MUT)]])

lad = [("L0  NORMAL", "2 s window / 100 ms hop · full cadence", GRN, GRNF),
       ("L1  ELEVATED", "queue > 2 windows -> hop widens to 200 ms", GRN, GRNP),
       ("L2  DEGRADED", "ring dropping -> hop 500 ms, drop oldest", AMB, AMBF),
       ("L3  DETECTOR DOWN", "gRPC gone > 5 s -> scoring stops, call lives", RED, REDF),
       ("L4  SHEDDING", "node at capacity -> reject NEW sessions only", RED, REDP)]
ly = 1.24
for nm, desc, ln_c, fl_c in lad:
    lbx = box(s3, 6.90, ly, 6.0, 0.40, ln_c, fl_c, 2.0, radius=0.10)
    rich(lbx, [[(nm + "    ", 9, True, ln_c), (desc, 8, False, INK)]])
    ly += 0.44

gr = box(s3, 6.90, 3.48, 6.0, 0.56, RED, REDP, 2.0)
rich(gr, [[("GOVERNING RULE", 8.5, True, RED), ("   absence of a score is never equivalent to a low score.", 8.5, False, INK)],
          [("Reporting “genuine” when the pipeline is broken is the one failure mode that actively causes harm.", 8, False, MUT)]])

# --- silent failures -------------------------------------------------------
hdr3 = tbox(s3, 0.42, 4.20, 12.5, 0.24)
rich(hdr3, [[("THE THREE THAT FAIL SILENTLY", 10, True, RED),
             ("   — no exception, no error, just quietly wrong output. 71 edge cases catalogued in total.", 9.5, False, MUT)]])

sf = [
 ("AU-04", "AUDIO", "Averaging a dual-leg fork",
  "The gateway forks caller and callee as two channels. Averaging them mixes two speakers into one signal, destroying both the deepfake and the speaker-verification signal.",
  "FIX  mono mandatory. Two legs arrive as two sessions sharing a call_id. Reject 2-channel input outright — never average.",
  "TEST  assert channels == 1 at the ingress adapter; a 2-channel fixture must raise.",
  "COST IF MISSED  every score on every dual-leg call is meaningless, and nothing anywhere reports an error."),
 ("AU-08", "AUDIO", "Packet-loss concealment",
  "On a bad line the gateway invents audio to cover lost packets. That audio is literally synthetic — so the detector flags a genuine caller as a deepfake.",
  "FIX  gateway sets concealed=true; windows over ~15% concealed samples are skipped or sent with a down-weight flag.",
  "TEST  replay at 30% packet loss with PLC on — false-positive rate must not rise.",
  "COST IF MISSED  genuine customers on poor lines get accused of fraud. This is what gets the system switched off."),
 ("SS-06", "SESSION", "Missing speaker enrolment",
  "No reference voiceprint makes similarity return 0.0, which fusion reads as 'total mismatch' — fabricating fraud signal for every caller who never enrolled.",
  "FIX  emit null plus speaker_signal=UNAVAILABLE. The risk engine renormalises over remaining signals.",
  "TEST  an unenrolled caller must not score higher than an enrolled match baseline.",
  "COST IF MISSED  every first-time caller looks like an impostor — false accusations at the worst possible moment."),
]
sx2 = 0.42
for cid, cat, headline, body, fix, test, cost in sf:
    c = box(s3, sx2, 4.48, 4.06, 2.02, RED, REDP, 2.25)
    c.text_frame.vertical_anchor = MSO_ANCHOR.TOP
    rich(c, [[(cid, 9, True, RED), ("   " + cat, 7.5, False, MUT)],
             [(headline, 11, True, INK)],
             [(body, 8, False, INK)],
             [(fix, 8, True, RED)],
             [(test, 7.5, False, MUT)],
             [(cost, 7.5, True, INK)]])
    sx2 += 4.22

# ══════════════════════════════════════════════════════════════════════════
OUT = "docs/streaming_bridge/VoiceShield-Bridge-3slides.pptx"
prs.save(OUT)
print("slide 3 done ->", OUT)
