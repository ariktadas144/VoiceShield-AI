# BASELINE.md — frozen pretrained RawNet2 on Indic speech

**Phase A.** The official ASVspoof 2021 RawNet2 checkpoint scored on our Indic test set
with **no fine-tuning and no weight modification**. This is the "before" against which
the Indic-adapted model is measured.

## Checkpoint

| | |
|---|---|
| File | `weights/pre_trained_DF_RawNet2.pth` |
| SHA-256 | `52d8ad5f524a0f600c7c876d7a157a8f06c44a03504d0b2795c852f5e42c9127` |
| Source | `https://www.asvspoof.org/asvspoof2021/pre_trained_DF_RawNet2.zip` |
| Upstream | `asvspoof-challenge/2021`, `LA/Baseline-RawNet2` |
| Trained on | ASVspoof 2019 LA train (DF track baseline) |
| Loaded | 119/123 tensors, 0 unexpected, **94.3 %** of parameters |
| Equivalence | `torch.equal == True` vs the official implementation (max abs Δ 0.000e+00) |

## Configuration

16 kHz · `nb_samp` 64,600 (4.04 s) · tiled padding · peak normalisation at load ·
CUDA · **6.2 ms/clip**.

### Class order

The official baseline labels data as `d_meta[key] = 1 if label == 'bonafide' else 0`
(`data_utils.py`), so **in this checkpoint index 0 is spoof** — the opposite of our
manifests, which use 1 = spoof. P(spoof) is therefore read from index 0.

That reading is confirmed by the data rather than chosen by it: ROC-AUC is directional,
and the used orientation gives **0.567** against
**0.433** mirrored. An inverted convention would show up as
AUC < 0.5.

## Dataset

`SherryT997/IndicTTS-Deepfake-Challenge-Data` @ `57347517658ae989597d8cef303cffb647ed2434`
(CC-BY-4.0). Test split: **1490 clips**, 744 bonafide /
746 spoof, five languages, language-stratified and text-disjoint from
train and dev.

## Results — normalised (the production preprocessing)

| Language | n | EER % | 95% CI | ROC-AUC | FPR % | FNR % | Precision % | Recall % | Accuracy % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hindi | 301 | **50.49** | [44.5, 56.8] | 0.491 | 20.62 | 89.36 | 31.25 | 10.64 | 47.18 |
| English | 301 | **43.53** | [36.9, 48.5] | 0.622 | 61.01 | 22.54 | 53.14 | 77.46 | 57.14 |
| Tamil | 288 | **39.24** | [33.3, 45.8] | 0.629 | 74.62 | 13.29 | 58.55 | 86.71 | 59.03 |
| Telugu | 300 | **50.67** | [45.3, 56.3] | 0.513 | 28.12 | 73.57 | 45.12 | 26.43 | 50.67 |
| Malayalam | 300 | **41.35** | [35.3, 47.7] | 0.618 | 48.89 | 33.94 | 62.29 | 66.06 | 59.33 |
| **POOLED** | 1490 | **45.30** | [43.1, 48.1] | 0.567 | 45.43 | 45.31 | 54.69 | 54.69 | 54.63 |
| **MACRO** | — | **45.05** | — | 0.574 | 46.65 | 46.54 | 50.07 | 53.46 | 54.67 |

## Results — un-normalised (ablation)

| Language | n | EER % | 95% CI | ROC-AUC | FPR % | FNR % | Precision % | Recall % | Accuracy % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hindi | 301 | **51.82** | [45.5, 58.1] | 0.443 | 35.00 | 76.60 | 37.08 | 23.40 | 45.51 |
| English | 301 | **42.86** | [36.9, 48.5] | 0.604 | 96.23 | 1.41 | 47.78 | 98.59 | 48.50 |
| Tamil | 288 | **69.11** | [63.9, 74.3] | 0.252 | 79.23 | 62.66 | 36.42 | 37.34 | 29.86 |
| Telugu | 300 | **47.99** | [42.0, 54.3] | 0.521 | 16.88 | 87.14 | 40.00 | 12.86 | 50.33 |
| Malayalam | 300 | **57.68** | [52.7, 63.3] | 0.411 | 62.22 | 55.76 | 46.50 | 44.24 | 41.33 |
| **POOLED** | 1490 | **56.71** | [54.0, 59.2] | 0.459 | 56.85 | 56.70 | 43.30 | 43.30 | 43.22 |
| **MACRO** | — | **53.89** | — | 0.446 | 57.91 | 56.71 | 41.56 | 43.29 | 43.11 |

## What this shows

**The pretrained checkpoint does not transfer to Indic speech.** Pooled EER
**45.30 %** at ROC-AUC **0.567** is barely
distinguishable from chance, and Hindi (0.491) and Telugu
(0.513) sit *exactly* at chance.

The score distribution explains why: median P(spoof) is **1.0000 for both classes**, and
the class means differ by only 0.03. The model is saturated — it calls almost everything
spoof — which is the classic out-of-domain failure, not a threshold problem.

**Cause: domain/language mismatch, not preprocessing.** Under the correct preprocessing
the model is already at its best and still near chance. The un-normalised variant is
*worse* than chance (pooled AUC **0.459**), and Tamil collapses to
AUC **0.252** — the corpus's Tamil loudness artefact
(raw peak AUC 0.059) is anti-correlated with what this checkpoint responds to. So
normalisation is not merely cosmetic here; without it the baseline is actively misleading.

This establishes substantial headroom for fine-tuning, and it is the honest reason the
adaptation is necessary at all.
