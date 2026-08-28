# Spoof generation pilot — SPRING_F5 and Indic-Mio

**Scope.** Download two candidate Indic TTS generators, synthesise 800 pilot clips,
validate the audio, audit it for shortcuts, audit its language quality, and decide whether
either generator is safe to train VoiceShield on. **No VoiceShield training was started and
no held-out evaluation material was touched.**

**Decision: APPROVE ONE.** SPRING_F5 is approved for training *conditional on mandatory
silence trimming*. Indic-Mio is rejected as drop-in training data. Reasoning in §14.

---

## 1. Why these two, and what the pilot had to prove

VoiceShield's spoof half currently contains xtts_v2 and freevc24 only. Both are
voice-conversion / autoregressive-VQ systems, and v1 has never seen a flow-matching or a
neural-codec-LM attack. The pilot asked three questions in order, and a failure at any one
of them would have ended it:

1. can the generators be run at all, reproducibly, under a permissive licence
2. does the output carry an acoustic shortcut — anything that separates spoof from
   genuine speech *without modelling synthesis*
3. does the output actually say the right words in the right language

Question 2 is the one that has killed every previous candidate. MMS-TTS was rejected when
a single RMS measurement separated it from bonafide at AUC 0.924; a detector trained on it
would have learned "loud = real". The same standard is applied here.

## 2. Models, pinned and verified

| model | revision | licence | gated | bytes |
|---|---|---|---|---|
| `SPRINGLab/SPRING_F5` | `898dd2a56fbb42c994b545fadfdd831eeadfafb0` | Apache-2.0 | no | 5,403,470,085 |
| `SPRINGLab/Indic-Mio` | `25feace00ca76c71c40b1e8d921fd3c2943c545e` | Apache-2.0 | no | 1,238,685,722 |
| `Aratako/MioCodec-25Hz-24kHz` | `3a737f0de2c6324cb2fe40c1fbd1056c7add423d` | MIT | no | 523,100,680 |

All three permissive, none gated. SPRING_F5 is F5-TTS (flow-matching DiT, ~337.5 M
parameters measured); Indic-Mio is an autoregressive LM over MioCodec tokens with a
separate 24 kHz codec. Two genuinely different attack families, and different from both
generators already in the training set.

Full hashes, package versions, GPU and per-clip seeds: `data/pilot_spoof/PROVENANCE.json`.

## 3. Reference design — the control that makes the comparison mean something

800 clips = 100 per language × 4 languages (Hindi, Tamil, Telugu, Malayalam) × 2
generators.

**Both generators received byte-identical inputs.** Every (reference clip, reference
transcript, target text) triple was fixed once, in `data/pilot_refs/pilot_items.jsonl`,
and consumed by both. Verified in §11 Gate 4: 400 shared items, 0 differing. Any acoustic
difference between the two generators therefore cannot be speaker, text, or language.

| language | references | distinct speakers | gender | source | licence |
|---|---|---|---|---|---|
| Hindi | 100 | not recoverable | unknown | SherryT997 **train split only** | CC-BY-4.0 |
| Tamil | 100 | 50 | 50 F / 50 M | OpenSLR SLR65 | CC-BY-SA-4.0 |
| Telugu | 100 | 47 | 58 F / 42 M | OpenSLR SLR66 | CC-BY-SA-4.0 |
| Malayalam | 100 | 41 | 55 F / 45 M | OpenSLR SLR63 | CC-BY-SA-4.0 |

Two deviations from the instruction to use OpenSLR, both deliberate and both material:

* **OpenSLR has no Hindi.** SLR63/65/66 cover Malayalam, Tamil and Telugu only. Hindi
  references come from the SherryT997 bonafide **train** split, never dev or test.
* **The Hindi "100 speakers" is 100 clip IDs, not 100 speakers.** SherryT997 exposes no
  speaker field, so Hindi speaker diversity is unknown and unverifiable. Tamil, Telugu and
  Malayalam speaker counts are real.

No reference synthesises its own transcript — each is assigned another speaker's
transcript from the same language by a derangement (0 fixed points, verified). Otherwise
the generator would be resynthesising an utterance it was handed rather than forging a new
one.

Every reference speaker appears on both sides of the pilot: as genuine speech, and as the
voice being cloned. That is intentional — it is what stops speaker identity from
predicting the label.

## 4. Generation parameters

| | SPRING_F5 | Indic-Mio |
|---|---|---|
| family | flow-matching DiT (F5-TTS) | AR LM over MioCodec tokens |
| config | `F5TTS_v1_Base_multilingual` | ChatML, speech token offset 151 669 (verified) |
| sampling | `nfe_step=32`, `cfg_strength=2`, `sway_sampling_coef=-1`, `speed=1.0` (upstream defaults) | `do_sample=True`, `temperature=0.9`, `top_p=0.9`, `max_new_tokens=1024` |
| precision | fp32 | **fp16, uniform across all 400** |
| output rate | 24 000 Hz (asserted from model config) | 24 000 Hz (asserted from codec config) |
| seed | `sha256(f"1234:{item_id}")[:4]` as uint32, per clip | same |
| result | 400/400 | 400/400, 0 token-empty |

Per-clip seeding means any single clip can be regenerated on its own without replaying the
run.

**Indic-Mio was regenerated from scratch at uniform fp16.** The first pass ran 307 clips
on CPU at fp32 and the remainder on GPU at fp16. Because the items are ordered by
language, precision was confounded with language — the fp16 tail was almost entirely
Malayalam. A spoof set split across two numeric precisions along a language boundary is
exactly the uncontrolled variable this audit exists to detect, so the mixed set was
discarded and all 400 regenerated at fp16.

## 5. Audio validation — all 800 clips

| check | spring_f5 | indic_mio | bonafide |
|---|---|---|---|
| unreadable | 0 | 0 | 0 |
| non-finite (NaN/inf) | 0 | 0 | 0 |
| multi-channel | 0 | 0 | 0 |
| all-silent | 0 | 0 | 0 |
| under 0.5 s | 0 | 0 | 0 |
| sample rate | 24 000 (all) | 24 000 (all) | 16 000 / 48 000 |
| **hard-clipped (flat-top ≥ 8 samples)** | **0** | **0** | **0** |

Longest run of samples pinned at full scale: 2 (spring_f5), 1 (indic_mio) — no clipping.

**This required a fix.** 40 of the first 400 SPRING_F5 clips (10 %) were written past full
scale and hard-clipped by the PCM_16 writer. Clipping adds broadband harmonic distortion
that survives loudness normalisation — it would have become a synthetic-only artefact
created by *this script*, not by the generator. Both writers now scale to 0.999 instead,
and all 40 were regenerated (deterministic seeds reproduce the same waveform, scaled
rather than clipped). `peak_before_scaling` in the manifests records the true peaks, which
reach 1.45. That SPRING_F5 emits out-of-range audio in 10 % of cases is a real property of
the generator and is reported as such.

Durations: spring_f5 median 3.78 s, indic_mio 4.36 s, bonafide 5.49 s. Totals 28.1 / 32.4
minutes of synthetic speech.

## 6. Acoustic shortcut audit — method and calibration

Nine features per clip — `rms_db, peak, crest_db, hf_share, noise_floor_db, silence_frac,
zcr, centroid_hz, duration_s` — everything resampled to 16 kHz first, the detector's rate.
Reported as distributions, not means, because a shortcut can hide in a tail.

Two things are measured per contrast: single-feature AUC (each feature alone) and a
5-fold cross-validated logistic regression on all nine (the "trivial classifier" — nine
numbers per clip, no waveform modelling, no spectrogram).

**The audit was calibrated before it was trusted.**

| injected into a random half of genuine speech | classifier AUC |
|---|---|
| nothing (null test) | **0.492** |
| +2.0 dB physical gain (rms + peak + floor together) | 0.606 |
| +4.5 dB physical gain | **0.755** |

The null test returns chance and every single-feature AUC lands within 0.06 of 0.5, so the
machinery invents nothing. +4.5 dB is the exact corpus-level loudness bias measured in
SherryT997, and it registers at 0.755 — that is the audit's practical detection floor.
(An earlier positive control reported 0.970 by raising RMS without raising peak, which is
physically impossible; that number was discarded.)

## 7. Shortcut results — as generated

Contrasts against the pilot's own reference clips (same speakers, same languages).

| contrast | worst single feature | trivial classifier |
|---|---|---|
| A indic_mio vs spring_f5 | hf_share 0.755 | 0.886 partly separable |
| B indic_mio vs bonafide | **silence_frac 0.196** | **0.959 trivially separable** |
| C spring_f5 vs bonafide | **silence_frac 0.143** | **0.948 trivially separable** |
| D all spoof vs bonafide | **silence_frac 0.169** | **0.936 trivially separable** |

The dominant cue is `silence_frac`, and it is inverted — spoofs have *less* silence.
Median silence fraction: bonafide 0.319, indic_mio 0.194, spring_f5 0.154. Genuine
recordings begin and end with room tone and a held microphone; TTS starts on the first
phoneme and stops on the last. Per language it is worse still: Tamil 0.042 and Telugu
0.052, i.e. near-perfect separation, because the OpenSLR clips carry long lead-ins.

This is packaging, not synthesis. A detector handed it would learn "does this clip begin
with silence".

## 8. Shortcut results — after identical silence trimming

The same audit with leading and trailing silence stripped from **every clip in every
group** by the same rule (`librosa.effects.trim`, `top_db=40`).

| contrast | as generated | trimmed | worst remaining feature |
|---|---|---|---|
| A mio vs f5 | 0.886 | 0.879 | hf_share **0.755** |
| B mio vs bonafide | 0.959 | **0.903** | hf_share **0.735** |
| C f5 vs bonafide | 0.948 | **0.825** | noise_floor 0.651, crest 0.611 |
| D all vs bonafide | 0.936 | **0.821** | crest 0.621 |

Trimming works, and it separates the two candidates cleanly:

* **SPRING_F5** loses its shortcut. After trimming **no single feature reaches
  |AUC−0.5| ≥ 0.25**. `hf_share` is 0.474 — indistinguishable from genuine speech.
* **Indic-Mio does not.** `hf_share` 0.735 is spectral and trimming cannot touch it.
  Median HF share: bonafide 0.002, spring_f5 0.002, **indic_mio 0.006**, with a p90 of
  0.026 against bonafide's 0.010. This is a MioCodec signature, and contrast A confirms it
  is the single feature that most distinguishes Mio from F5 (0.755).

## 9. The comparison that decides it — against data VoiceShield already trains on

The §7–8 contrasts use the pilot's reference corpus as bonafide, and that corpus is not
what VoiceShield trains on. Scored against the actual training bonafide, with the spoofs
already in use as the calibration point:

| population | trivial classifier vs `bonafide_train` |
|---|---|
| `spoof_existing` (xtts_v2 / freevc24) — **accepted baseline** | **0.692** |
| `bonafide_ref` — *genuine speech*, the pilot's references | **0.779** |
| `spring_f5` | 0.868 (+0.176 over baseline) |
| `indic_mio` | 0.916 (+0.225, trivially separable) |

The `bonafide_ref` row is the one that matters for interpretation: **two corpora of
genuine human speech already differ at 0.779**. Corpus identity alone buys most of what
the candidates score. Against that yardstick SPRING_F5's 0.868 is a modest excess, while
Indic-Mio's 0.916 clears the trivially-separable line.

Per feature against `bonafide_train`, `crest_db` is 0.458 (spring_f5) and 0.488
(indic_mio) — no crest shortcut. `hf_share` is 0.344 for spring_f5 and **0.630** for
indic_mio, reproducing §8 on an independent bonafide population.

**Correction to an intermediate result.** Partway through generation, on ~95 F5 and ~50
Mio clips, I measured crest_db at AUC 0.856 / 0.799 and concluded the generators
introduced a crest-factor shortcut. That was wrong. The items are ordered by language, so
the partial sample was almost entirely Hindi — whose references come from SherryT997 at
16 kHz while the other three languages come from OpenSLR at 48 kHz. The apparent crest gap
was a corpus artefact of the sampling order, and it vanishes on the complete, balanced set
(0.458 / 0.488). Two hypotheses I built on that reading — a shared noise floor, and a
crest-randomising augmentation — were tested and are moot.

## 10. Low-pass probe through VoiceShield v1

v1 (`checkpoints_v1`, dev EER 2.2 %, threshold 0.176874), flagged rate:

| group | unfiltered | 4 kHz | 2 kHz |
|---|---|---|---|
| bonafide (genuine) | 17.2 % | 15.8 % | 17.8 % |
| **spring_f5** | **11.8 %** | 12.2 % | 9.5 % |
| indic_mio | 26.0 % | 35.5 % | 30.8 % |

Two findings.

**v1 cannot see these attacks.** It flags genuine speech more often (17.2 %) than
SPRING_F5 forgeries (11.8 %) — mean P(spoof) 0.0799 for real speech against 0.0587 for
F5. On this generator v1 is worse than useless. Indic-Mio reaches only 26 %. Both
generators are real blind spots, which is the entire reason to consider them.

**Neither is detected by bandwidth.** Low-passing does not collapse the flagged rate; for
indic_mio it *rises* at 4 kHz (26.0 → 35.5 %). Whatever little v1 sees is not a band edge.
Genuine speech is also stable under low-pass (17.2 → 15.8 → 17.8 %), so band-limited real
speech is not pushed into false accusations.

Separately: v1 flagging 17.2 % of genuine clips against a 2.2 % dev EER is a 7.8×
degradation on out-of-domain genuine speech, consistent with the bonafide-domain shift
already documented. All 100 Hindi references are inside v1's own training bonafide (train
split), and v1 still flags 21 % of them.

## 11. Leakage gates — all passed

| gate | result |
|---|---|
| 1 references from a held-out split | 100 from indic **train** (allowed), **0 dev, 0 test** |
| 2 references in external evaluation material | `external2` 1800 held-out rows: **0 overlap**; `mixed` 2975 held-out rows: **0 overlap** (100 train-split overlaps, allowed) |
| 3 every clip traces to a declared reference | 400 + 400, 0 orphan, 0 ref-mismatch, 0 duplicate ids |
| 4 both generators received identical inputs | 400 shared items, **0 differing in reference or text** |

**The held-out evaluation is intact.** Nothing in FLEURS, IndicSynth, or the XTTS/FreeVC
external sets was consumed.

Gate 2 initially reported a leak against `data/mixed`. It was a bug in the gate, not a
leak: it compared raw set intersections, but `data/mixed` contains train material, and the
100 hits were the Hindi references already accounted for in Gate 1. The gate is now
split-aware and still fails on any genuine dev/test overlap.

## 12. Deviations, upstream defects, and bugs found

Recorded because several would silently corrupt results.

**In the published models**

1. **Indic-Mio's card writes 24 kHz audio at 44100 Hz.** `sf.write(..., 44100)` against a
   codec whose `config.yaml` says `sample_rate: 24000`. Following the card plays every
   clip 1.84× fast and shifts formants up ~1058 cents. The rate is read from the codec and
   asserted instead.
2. **Indic-Mio's card passes `temperature`/`top_p` without `do_sample=True`**, so
   transformers silently runs greedy decoding and ignores both. `do_sample=True` is
   explicit here.
3. **Indic-Mio's card specifies bfloat16.** This GPU is Turing (GTX 1650) with no bf16
   hardware; fp16 is used and outputs are checked finite.
4. **SPRING_F5's documented usage is broken.** `config.json` maps `AutoModel` to
   `model.SPRING_F5Model`, but revision `898dd2a5` has no `model.py` at the repo root —
   only `README.md`, `config.json`, `.gitattributes`. `AutoModel.from_pretrained(...,
   trust_remote_code=True)` cannot resolve. The repo does ship the full F5-TTS source, so
   the checkpoint is loaded through the upstream `F5TTS` API.
5. **SPRING_F5's `f5_tts/` ships without `__init__.py`**, so it imports as a namespace
   package and `importlib.resources.files("f5_tts")` cannot find `configs/`. Markers are
   created at setup.
6. **SPRING_F5's checkpoint cannot be loaded on this GPU as published.** It is 5.4 GB
   (model + EMA + Adam moments) and `load_checkpoint` does `torch.load(map_location=cuda)`
   — instant OOM on 3.64 GiB. The EMA weights (337.5 M params, 1.26 GiB) were extracted
   verbatim to safetensors; hashes and method in `checkpoints/EMA_EXTRACTION.json`.
7. **`F5TTS.infer` never passes `lang`**, so `num2vec(text, lang=None)` raises on any text
   containing a digit — 2 of 400 items. Numbers are now spelled out upfront for *both*
   generators, keeping their inputs identical.
8. **`miocodec` declares `requires-python >=3.12`** but runs correctly on 3.11.
9. **`MioCodec` vs `MioCodecModel`.** The bundle class demands vocoder weights prefixed
   `vocoder.`; the 24 kHz variant has an integrated iSTFTHead and ships none.
10. **MioCodec loads with `strict=False`.** 203 of 523 tensors are legitimately absent —
    `weights_to_save()` deliberately excludes `ssl_feature_extractor` (WavLM, fetched from
    the torch hub), `feature_decoder` and `conv_upsample`. A naive key-set check reports a
    203-tensor catastrophe on a healthy checkpoint; the guard checks only learned
    inference parameters and now passes at 0 missing / 0 unexpected.
11. **`ai4bharat/indic-conformer-600m-multilingual` is gated** (403). It was the preferred
    ASR — MIT, Indic-specific. Whisper-large-v3-turbo (MIT, ungated) is used instead.
12. **MioTTS's own `normalize_text()` strips ASCII spaces** (it is written for Japanese).
    Applying it would destroy word boundaries in all four languages. Not used.

**In the source corpora**

13. **18 OpenSLR Telugu transcripts end in a literal backslash-n**, not a newline. A TTS
    would try to pronounce it. Cleaned before use.

**In my own code, caught before they reached a result**

14. **`re.compile(r"[^\w\s]")` deleted every Devanagari matra and virama.** Python's `\w`
    does not match combining marks, so `नमस्ते` normalised to `नमस त`. Indic scripts are
    abugidas — the matras carry the vowels — so this would have made every CER in §13
    meaningless. Punctuation is now removed by Unicode category.
15. **Gate 2 was not split-aware** (§11).
16. **A partial-data conclusion was wrong** (§9) — reported rather than quietly dropped.

**Deviations with no effect, verified**

17. `config.json` declares `remove_sil: true`; clips were written with
    `remove_silence=False`. Tested post-hoc on all F5 clips: `split_on_silence` finds no
    pause ≥ 1 s, so the setting changes nothing on this data (crest, RMS, duration and
    silence fraction all identical to 3 decimal places).
18. miocodec falls back from FlashAttention to PyTorch SDPA — mathematically equivalent.

## 13. Language quality — does the speech say the right words?

A generator that emits fluent-sounding nonsense would be worse than one with a loudness
bias: it would teach the detector that "Malayalam-sounding gibberish = spoof", and the
acoustic audit in §6–9 cannot see it. Each clip was transcribed with
`openai/whisper-large-v3-turbo` (MIT, fp32) and scored by character error rate against the
text it was told to say. Stratified sample, 30 clips per (group × language), 360 total.

**The genuine reference clips were transcribed the same way, and that control is the
result.** Whisper is not equally good at these four languages, so an absolute CER means
nothing; only the gap to genuine speech in the same language does.

| | Hindi | Malayalam | Tamil | Telugu |
|---|---|---|---|---|
| **bonafide (control)** | 8.7 % | **64.7 %** | 13.0 % | 15.9 % |
| spring_f5 | 4.8 % | 91.3 % | 10.2 % | 19.4 % |
| indic_mio | 9.5 % | 94.4 % | 11.7 % | 36.8 % |
| **excess, spring_f5** | **−3.9 %** | +26.6 % | **−2.8 %** | **+3.6 %** |
| **excess, indic_mio** | **+0.8 %** | +29.7 % | **−1.3 %** | **+20.9 %** |

**Malayalam is not measurable here and its numbers must not be read as a quality
verdict.** Whisper scores 64.7 % CER on *genuine* Malayalam speech, so the instrument is
broken for that language and the +26.6 / +29.7 excesses are differences against a baseline
that means nothing. The preferred ASR (`ai4bharat/indic-conformer`, MIT, with a dedicated
Malayalam head) is gated and unavailable. **Malayalam quality is unverified for both
generators.**

Where the control is sound:

* **SPRING_F5 — good in Hindi, Tamil and Telugu.** In Hindi (−3.9 %) and Tamil (−2.8 %) it
  is *more* intelligible than the genuine recordings, which is expected: read TTS is more
  canonical than spontaneous crowdsourced speech. Telugu +3.6 % is well inside tolerance.
* **Indic-Mio — good in Hindi and Tamil, degraded in Telugu** at +20.9 %.

The script's own overall verdict prints POOR for both. That verdict is wrong and is
overridden here: it takes the worst language, and the worst language is Malayalam, where
the measurement is invalid.

## 14. Decision

### SPRING_F5 — **APPROVED**, conditional

| criterion | result |
|---|---|
| licence, provenance, reproducibility | Apache-2.0, pinned revision, per-clip seeds |
| audio validity | 400/400, no NaN, no clipping, no silent clips |
| shortcut, as generated | fails — `silence_frac` 0.143, classifier 0.948 |
| **shortcut, after mandatory trimming** | **passes — no single feature ≥ 0.25, classifier 0.825** |
| vs accepted baseline (`spoof_existing` 0.692) | 0.868, against 0.779 for two *genuine* corpora |
| spectral match | `hf_share` 0.474 — indistinguishable from genuine speech |
| language quality | good in Hindi, Tamil, Telugu; Malayalam unverified |
| novelty vs v1 | v1 flags it **less often than real speech** (11.8 % vs 17.2 %) |

**Conditions of approval, all mandatory:**

1. **Silence trimming applied identically to both classes** at dataset build time. Without
   it the classifier sits at 0.948 and Tamil/Telugu are separable at AUC 0.042 / 0.052 on
   silence fraction alone. This is not optional and it must be applied to bonafide too —
   trimming only the spoof half would invert the same shortcut.
2. **Hold Malayalam back** until its quality is verified with an ASR that can actually
   transcribe Malayalam.
3. **Dose control and a re-audit after mixing**, as with every previous generator. The
   0.868-vs-0.692 excess over the accepted baseline is modest but real.

### Indic-Mio — **REJECTED** as drop-in training data

| criterion | result |
|---|---|
| licence, provenance, reproducibility | Apache-2.0, pinned, seeded — no objection |
| audio validity | 400/400 clean, 0 failures |
| **shortcut after trimming** | **fails — `hf_share` 0.735, classifier 0.903** |
| vs accepted baseline | 0.916 (+0.225), trivially separable |
| language quality | Telugu degraded +20.9 %; Malayalam unverified |

The deciding fact is that **trimming does not fix Indic-Mio.** Its excess high-frequency
energy is spectral: median HF share 0.006 against 0.002 for both genuine speech and
SPRING_F5, p90 0.026 against 0.010. It survives silence trimming untouched (0.735 both
before and after), it reproduces against an independent bonafide population (0.630 vs
`bonafide_train`), and it is the single feature that most separates Mio from F5 (0.755) —
two generators that received byte-identical inputs. That makes it a MioCodec signature,
not a property of the speech.

Training on it would hand VoiceShield a "count the high-frequency energy" route to ~0.73
AUC without modelling synthesis at all. This is the same failure that disqualified MMS-TTS
at RMS AUC 0.924, and the same standard applies.

**Rejection is of the audio as drop-in training data, not of the model.** A route back
exists and is testable: if the HF excess is a codec resampling artefact rather than
something in the speech, a bandwidth-matching step might remove it. That has not been
demonstrated, so it is not a basis for approval today.

## 15. Limitations

1. **Malayalam quality is unverified** for both generators (§13). The approved SPRING_F5
   set is therefore Hindi, Tamil and Telugu — 300 of its 400 clips.
2. **Hindi speaker diversity is unknown.** SherryT997 has no speaker field; "100 Hindi
   references" means 100 clips, not 100 speakers.
3. **Hindi references are inside v1's training bonafide** (train split). Hindi rows in §10
   are in-domain and are not unseen-speaker evidence.
4. **The bonafide reference corpus is not the training bonafide.** It scores 0.779 against
   `bonafide_train` on the trivial classifier — genuine speech separable from genuine
   speech, purely by corpus. Every §7–8 number carries some of that.
5. **Mixed reference sample rates** — Hindi at 16 kHz, the others at 48 kHz — so the
   bonafide group is acoustically heterogeneous. Everything is resampled to 16 kHz before
   any feature is computed, which bounds but does not eliminate this.
6. **Nine hand-chosen features.** They caught the shortcuts that mattered before, and the
   audit is calibrated (§6), but a shortcut outside this feature set would not be seen.
7. **No training was run**, so nothing here shows what VoiceShield would actually *learn*
   from this data. Separability by a logistic regression is a hazard, not a prediction.
8. **800 clips is a pilot**, ~60 minutes of audio. It is enough to reject a generator and
   not enough to train one.

## 16. What was produced

```
data/pilot_refs/references.jsonl      400 references, hashed, with speaker/gender/source
data/pilot_refs/pilot_items.jsonl     400 (reference, text) pairs used by BOTH generators
data/pilot_spoof/spring_f5/           400 clips + manifest (seeds, hashes, peaks)
data/pilot_spoof/indic_mio/           400 clips + manifest
data/pilot_spoof/PROVENANCE.json      revisions, hashes, licences, versions, seeds
data/pilot_spoof/{audit,audit_trim,populations,lowpass,quality}.json
data/pilot_spoof/log_*.txt            full console output of every analysis

data/build_references.py              reference selection
data/build_pilot_items.py             pairing, derangement, number spelling
data/gen/gen_spring_f5.py             generator A
data/gen/gen_indic_mio.py             generator B
data/gen/record_provenance.py         reproducibility record
benchmark/pilot_audit.py              validation + shortcut audit (--trim)
benchmark/pilot_populations.py        comparison against data already in use
benchmark/pilot_lowpass.py            v1 probe
benchmark/pilot_quality.py            ASR round-trip
benchmark/pilot_leakage.py            held-out gates
```

The generation environment is `.venv-gen`, deliberately separate: SPRING_F5 pins
`numpy<=1.26.4` and would have downgraded the detector's `numpy==2.1.3`. **The VoiceShield
environment was not modified.**

## 17. Recommended next step

Build a SPRING_F5 training mixture over **Hindi, Tamil and Telugu only**, with silence
trimming applied identically to both classes, and re-run the shortcut audit *on the mixed
dataset* before any training starts. Do not include Indic-Mio.

Pre-register the prediction before training, per the standing rule: on this evidence
SPRING_F5 should be undetectable to v1 (11.8 % flagged, below the 17.2 % genuine-speech
rate), so a model that learns it should show a large gain on SPRING_F5 with no worsening
of the genuine-speech false-accusation rate. If the false-accusation rate rises, the
trimming condition was not applied symmetrically.
