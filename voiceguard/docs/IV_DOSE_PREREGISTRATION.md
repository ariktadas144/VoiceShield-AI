# Pre-registration — IndicVoices dose-response (15%)

## The B collapse, diagnosed

Ruled out by construction: spoof exposure is identical (3,440 clips, 216 steps/epoch),
total size identical, real:fake identical at 1.017:1 both overall and per language. The
only change was +840 IndicVoices, −526 SherryT997, −314 OpenSLR.

**The literature's mechanism is not what happened here.** Multi-corpus work reports that
added external data "pulls primary bonafide embeddings toward the spoof region". Measured
on our models, bonafide barely moved (+0.018) while the *unseen spoofs moved toward real*:

| set | Δ score, f5-trim → f5-iv |
|---|---|
| internal bonafide | +0.018 |
| ext spoof xtts_v2 | **−0.177** |
| ext spoof freevc24 | **−0.181** |
| SPRING_F5 held-out | +0.031 (retained at 92.5%) |

**Why:** IndicVoices is the nearest training population to both unseen generators.

| unseen generator | nearest centroid | separability from IndicVoices |
|---|---|---|
| xtts_v2 | IndicVoices 1.45 (sherry 1.73, openslr 3.40) | 0.858 (sherry 0.966, openslr 0.998) |
| freevc24 | IndicVoices 1.98 (sherry 2.53, openslr 4.73) | 0.978 (sherry 0.998, openslr 1.000) |

Labelling that region "real" claims territory the unseen spoofs sit in. The same act is
what fixed FLEURS, because FLEURS sits there too. Unseen-real and unseen-fake overlap
acoustically, so dose moves both together. Of the five candidate causes, this is (A) too
much IndicVoices specifically, operating through (E) a class-conditional domain shift —
not (B) too little Sherry/OpenSLR and not (C) spoof starvation.

## The dose and why 15%

Exactly half of 30%, giving a clean three-point curve at 0 / 15 / 30 with everything else
fixed. That is the most informative single run available, because it tests the thing the
diagnosis cannot settle from two points: **is the trade linear or does C saturate?**

* If **linear**, straight-line interpolation predicts B ≈ 23.1%, C ≈ 10.4%, FLEURS ≈ 24%
  — no dose satisfies both B < 22% and C < 10.61%, and the problem is structural rather
  than a tuning error. That is a decisive negative result worth having.
* If **C saturates** — plausible, since covering a bonafide domain is a coverage problem
  rather than a volume one — then half the dose keeps most of the safety gain while
  claiming half the contested territory, and B recovers further than the line predicts.

Composition: real = SherryT997 2185 / OpenSLR 892 / IndicVoices 420. Spoof side, total
size, class balance, internal test split all byte-identical to both previous runs.

## Predictions

* **A** — approximately preserved, 1.5–3.5%.
* **B** — better than f5-iv's 28.23%. Predict **< 25%**; a linear trade puts it near 23%.
* **C** — still materially better than f5-trimmed's 14.39%. Predict **< 12%**.
* **D** — better than f5-trimmed's 47.12% / AUC 0.523. Predict **AUC ≥ 0.55**.
* **FLEURS FPR** — substantially below 40%. Predict **< 28%**.

**Failure is defined in advance as:** B still ≈28% or worse, **or** C and FLEURS
returning toward f5-trimmed levels (C ≥ 14%, FLEURS ≥ 38%). Either outcome means dose is
not the lever and the overlap is structural.

I am not predicting that this run satisfies every Step 13 target simultaneously. On the
linear reading it cannot, and saying so now is the point of pre-registering.

## Audit

Step 10 gate passes: REAL vs ALL FAKE 0.654, vs SPRING_F5 0.757, vs Sherry spoof 0.627 —
between the 30% mixture (0.651) and F5-only (0.680), as expected for an intermediate dose.

## Changed variable

**IndicVoices share of each Indic language's real budget: 30% → 15%.** Nothing else.
