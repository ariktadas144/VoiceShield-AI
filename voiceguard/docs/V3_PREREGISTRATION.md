# v3 pre-registration

Written **before** v3 was trained, so the outcome cannot be reinterpreted afterwards.

## What v3 changes

Exactly two things relative to v2:

1. **Initialisation** — starts from the v1 checkpoint rather than the official ASVspoof
   weights, so v1's bonafide robustness and safety are retained rather than re-derived.
2. **MMS-TTS share of spoof** — 43 % → **25 %** on the treated languages.

Bonafide sources, architecture, preprocessing, optimizer, loss, sample rate, schedule,
seed and the held-out test sets are all unchanged. No RawBoost.

## Why 25 % and not 50 %

Source-level balance is already satisfied: two bonafide resources (SherryT997, OpenSLR)
and two generator families (SherryT997's, MMS-TTS). The published finding is that the
*balance* of bonafide resources and generators drives generality, not that each generator
needs equal share. v2's 43 % coincided with the safety collapse, so the share is reduced
while keeping MMS frequent enough to teach cross-generator transfer.

## The prediction, and why it is hedged

The diagnostic found that MMS-TTS is **acoustically identifiable independently of
synthesis**:

* separable from every other group by RMS at **AUC 0.924**
* HF energy share **0.000** against 0.002–0.005 for all other groups
* crest factor 14.34 against 16.3–17.5

and that v2 measurably absorbed this: low-passing *genuine* speech to 4 kHz raises its
flagged-as-spoof rate to **17.5 %** for v2 against **3.8 %** for v1, a 4.6x difference on
audio where nothing but bandwidth changed.

**A shortcut of that kind is a property of the data, not of the sampling proportion.**
Reducing MMS from 43 % to 25 % lowers how much the model can lean on it, but does not make
loudness or bandwidth uninformative. So:

> **Predicted: v3 recovers part of v1's safety and keeps part of v2's cell-D gain, but
> does not fully achieve both.** A clean success — safety at v1 levels *and* D at v2
> levels — would be evidence that the shortcut mattered less than the diagnostic implies.

If v3 lands in that partial middle, the indicated next step is **not** more sampling
tuning. It is to make the shortcut uninformative — the distinguishing acoustics must
appear on both labels — which is a data-conditioning question, not an architecture one.

## Decision rule, fixed in advance

Freeze v3 only if **all** hold:

* safety within a few points of v1 on every genuine-speech condition, and the 50 Hz hum
  false accusation stays at ~0 %
* cell D materially above v1 (AUC 0.478)
* cell C at or near v1 (0.956)
* cell A acceptable (≥ 0.99)

Cell B improving would be a bonus; nothing in this experiment specifically targets it,
since B's regression originates in v1's bonafide change and was untouched by v2's
generator diversity.
