# TRAINING.md — Indic fine-tuning of VoiceGuard RawNet2

## Configuration

| Setting | Value | Basis |
|---|---|---|
| Initialisation | official ASVspoof 2021 RawNet2 | 119/123 tensors, 94.3 % of params |
| Head alignment | binary head rows swapped | official head is `1 == bonafide`; ours is `1 == spoof` |
| Architecture | RawNet2, unmodified | only `SincConv.sample_rate` made configurable |
| Sample rate | 16,000 Hz | restores the official config; required for weight reuse |
| Input length | 64,600 samples (4.04 s) | official `nb_samp`; shorter clips tiled |
| Normalisation | per-utterance peak, at load | identical in training and inference |
| Batch size | 32 | official recipe; measured 1.22 GiB peak |
| Optimizer | Adam, weight decay 0.0001 | official recipe |
| Learning rate | 0.0001 | official recipe |
| Scheduler | ReduceLROnPlateau, factor 0.5, patience 3, min 1e-7 | published anti-spoofing fine-tuning practice |
| Early stopping | patience 10 on dev EER | same source |
| Max epochs | 30 | ceiling, not a target |
| Loss | `NLLLoss` on log-probabilities | forward already applies `log_softmax` |
| Class weights | **none** | data is 49.9/50.1; the official `[0.1, 0.9]` suits ASVspoof's 10/90 |
| Precision | FP32 | AMP measured **2.7× slower** on this GPU (no tensor cores) |
| Seed | 1234 | official recipe |
| Selection | **lowest dev EER** | test never used |

### Two deliberate departures from the official recipe

**No class weights.** The official uses `CrossEntropyLoss(weight=[0.1, 0.9])` because
ASVspoof 2019 LA train is ~10 % bonafide. Ours is balanced, and those weights would bias
the model toward calling everything spoof — inflating precisely the error that matters
most, a genuine speaker flagged as synthetic.

**`NLLLoss`, not `CrossEntropyLoss`.** `RawNet.forward` already ends in `log_softmax`, so
the official pairing applies it twice. `NLLLoss` on log-probabilities is the objective
that pairing was meant to express.

## Hardware and runtime

NVIDIA GeForce GTX 1650, 4096 MiB · 12 CPU cores · batch 32 peaked at **1.22 GiB** of 3.64 GiB usable.
30 epochs, ~90 s each, **~45 minutes** total. Inference **6.1 ms/clip**.

## Training curve

| Epoch | LR | Loss | Train acc | Dev EER | Dev FPR | Dev FNR | Pred spoof |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.00e-04 | 0.8353 | 61.47 % | 28.28 % | 28.4 % | 28.3 % | 50.6 % |
| 2 | 1.00e-04 | 0.4845 | 76.04 % | 18.59 % | 18.7 % | 18.6 % | 50.9 % |
| 3 | 1.00e-04 | 0.3395 | 84.43 % | 13.74 % | 13.7 % | 13.6 % | 51.0 % |
| 5 | 1.00e-04 | 0.1936 | 91.87 % | 9.02 % | 9.1 % | 9.0 % | 51.2 % |
| 8 | 1.00e-04 | 0.1114 | 95.57 % | 5.12 % | 5.3 % | 5.1 % | 51.3 % |
| 12 | 1.00e-04 | 0.0478 | 98.06 % | 3.64 % | 3.7 % | 3.7 % | 51.3 % |
| 17 | 1.00e-04 | 0.0285 | 99.02 % | 2.09 % | 2.2 % | 2.1 % | 51.4 % |
| 20 | 1.00e-04 | 0.0218 | 99.07 % | 3.90 % | 3.9 % | 3.8 % | 51.3 % |
| 24 | 5.00e-05 | 0.0048 | 99.90 % | 1.82 % | 1.8 % | 1.7 % | 51.4 % |
| 29 | 2.50e-05 | 0.0060 | 99.81 % | 1.41 % | 1.5 % | 1.4 % | 51.4 % |
| 30 | 2.50e-05 | 0.0039 | 99.86 % | 1.68 % | 1.7 % | 1.6 % | 51.4 % |

**Best: dev EER 1.41 % at epoch 29**, threshold
0.8062. The LR halved twice under the plateau rule (1e-4 → 5e-5 → 2.5e-5).

## Integrity checks (Phase G)

| Check | Result |
|---|---|
| Training loss finite throughout | PASS |
| Dev scores finite throughout | PASS |
| Class-prediction balance | 50.6–51.4 % predicted spoof — no collapse |
| NaNs | none |
| Checkpoint saved on dev-EER improvement only | PASS |
| **Reload in a fresh process** | **bit-identical predictions, max abs Δ 0.000e+00** |

## Reproducibility manifest

| Item | Value |
|---|---|
| Source commit | `88c0f44c44d4bfde0bd71343397f46ef98b42735` |
| Dataset | `SherryT997/IndicTTS-Deepfake-Challenge-Data` |
| Dataset revision | `57347517658ae989597d8cef303cffb647ed2434` |
| Dataset licence | CC-BY-4.0 |
| Manifest hash (train+dev+test) | `b42fa068aa43eead71412f5feafd0deb4fae08c091eacf50...` |
| Pretrained checkpoint | `52d8ad5f524a0f600c7c876d7a157a8f06c44a03504d0b27...` |
| Trained checkpoint | `e9937affd88c0232c323240b839c2ff27ac65e3598fa5af4...` |
| Model config | `d04422262d9d784e239bc11efd60842b7a3f6f0be8f4f2ea...` |
| Dependency lock | `requirements.lock.txt` (80 pinned) |
| Random seed | 1234 |
| Split seed | 0 (language-stratified, text-disjoint) |

## Reproduce

```bash
python weights/load_pretrained.py                    # expect 119/123
pytest tests/ -v                                     # 17 tests
python data/build_indic.py --target-shards --report-shortcut
python main.py --manifests data/indic --init pretrained --batch_size 32 --seed 1234
python benchmark/baseline.py --split test --ablation                       # Model A
python benchmark/baseline.py --ckpt checkpoints_indic/best_model.pth --split test --ablation   # Model B
```
