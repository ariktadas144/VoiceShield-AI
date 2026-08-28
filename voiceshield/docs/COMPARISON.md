# COMPARISON.md — pretrained vs Indic fine-tuned VoiceShield RawNet2

Both models scored by the **same code path** (`benchmark/baseline.py`) on the **same
held-out test set** (1,490 clips, 744 bonafide / 746 spoof, five languages), which was
untouched during training and threshold selection.

* **Model A** — official ASVspoof 2021 RawNet2, frozen, no Indic fine-tuning.
* **Model B** — the same architecture fine-tuned on Indic data. `checkpoints_indic/best_model.pth`, sha256 `e9937affd88c0232c323240b839c2ff2...`

## Pooled result

| Metric | Pretrained (Model A) | Indic fine-tuned (Model B) | Δ | |
|---|---:|---:|---:|---|
| EER | 45.30 % | 1.74 % | -43.56 pp | **improved** |
| ROC-AUC | 0.57 | 1.00 | +0.43 | **improved** |
| FPR | 45.43 % | 1.88 % | -43.55 pp | **improved** |
| FNR | 45.31 % | 1.74 % | -43.57 pp | **improved** |
| Precision | 54.69 % | 98.13 % | +43.43 pp | **improved** |
| Recall | 54.69 % | 98.26 % | +43.57 pp | **improved** |
| Accuracy | 54.63 % | 98.19 % | +43.56 pp | **improved** |

## Per language

| Language | n | EER A | EER B | Δ EER | AUC A | AUC B | FPR B | FNR B |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Hindi | 301 | 50.49 % | **0.00 %** | -50.49 pp | 0.491 | 1.000 | 0.62 % | 0.00 % |
| English | 301 | 43.53 % | **3.65 %** | -39.88 pp | 0.622 | 0.988 | 3.77 % | 4.93 % |
| Tamil | 288 | 39.24 % | **3.82 %** | -35.41 pp | 0.629 | 0.989 | 4.62 % | 2.53 % |
| Telugu | 300 | 50.67 % | **0.00 %** | -50.67 pp | 0.513 | 1.000 | 0.00 % | 0.00 % |
| Malayalam | 300 | 41.35 % | **1.35 %** | -40.00 pp | 0.618 | 1.000 | 0.74 % | 1.21 % |
| **MACRO** | — | 45.05 % | **1.76 %** | -43.29 pp | 0.574 | 0.995 | 1.95 % | 1.73 % |

## Does Indic fine-tuning improve VoiceShield on Indic speech?

**Yes, decisively.** Pooled EER falls from **45.30 %** to
**1.74 %** and ROC-AUC rises from **0.567**
to **0.998**. Every one of the five languages improves, and the two
that sat exactly at chance for the pretrained model — Hindi (0.491)
and Telugu (0.513) — reach 0.00 % EER.

The score distributions show what changed. Model A is saturated: median P(spoof) is
1.0000 for *both* classes and the class means differ by 0.0335.
Model B separates them by **0.9562** — bonafide median 0.0001, spoof median 1.0000.

## Train/serve consistency (same Model B, different input conditioning)

| Language | normalised input | un-normalised input | Δ |
|---|---:|---:|---:|
| Hindi | 0.00 % | 0.67 % | +0.67 pp |
| English | 3.65 % | 4.31 % | +0.67 pp |
| Tamil | 3.82 % | 26.75 % | +22.93 pp |
| Telugu | 0.00 % | 0.00 % | +0.00 pp |
| Malayalam | 1.35 % | 2.32 % | +0.98 pp |
| **POOLED** | **1.74 %** | 7.92 % | +6.17 pp |

Model B was trained on peak-normalised audio. Feeding it un-normalised audio at
inference costs **+6.17 pp** pooled, and
Tamil degrades from 3.82 % to
26.75 %. Tamil is exactly the language whose raw peak
amplitude separates the classes at AUC 0.059, so this is the train/serve mismatch the
shared `audio_utils` front end exists to prevent — not a property of the model.

## Honest limitations

* **No unseen-speaker or unseen-generator claim.** The corpus carries neither speaker nor
  generator metadata, so those splits are impossible. Splits are language-stratified and
  text-disjoint, which is what the metadata supports.
* **Tamil is 100 % female and Malayalam 93 % female**, so those two figures do not measure
  male-voice performance in those languages.
* Results are on one corpus, one seed. They say the adaptation works on this data; they do
  not establish generalisation to other Indic TTS systems.
