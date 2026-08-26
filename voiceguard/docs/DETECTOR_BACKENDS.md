# DETECTOR_BACKENDS.md — selectable detection backends

Two detectors sit behind one interface. A configuration switch chooses which runs; they
are never combined, and neither imports the other.

```
                        AUDIO
                          |
                16 kHz mono float32          <- the only shared contract
                          |
              +-----------+-----------+
              |                       |
     VoiceGuard-specific        Dhwani-specific
       preprocessing              preprocessing
              |                       |
      VoiceGuard-Indic             Dhwani
              |                       |
              +-----------+-----------+
                          |
                   DetectionResult
```

Model-specific conditioning stays inside each adapter: the two do **not** share an input
contract beyond sample rate and channel count, and forcing one model's windowing onto
the other is exactly the train/serve mismatch this project spent its time removing.

## Usage

```bash
python detect.py --backend voiceguard --audio sample.wav     # default
python detect.py --backend dhwani     --audio sample.wav
python detect.py --backend dhwani     --audio sample.wav --json
```

Default is `voiceguard`; Dhwani is the optional alternative.

## Provenance — these are NOT equivalent

### VoiceGuard-Indic (ours)

| | |
|---|---|
| Checkpoint | `frozen/voiceguard-indic-v0.1.pth` |
| SHA-256 | `e9937affd88c0232c323240b839c2ff27ac65e3598fa5af49393a435ae1a6b9b` |
| Source commit | `6fd1b44ca567e534eec605694852894f85fb21b4` |
| Architecture | RawNet2, unmodified; official ASVspoof 2021 init (94.3 % of params) |
| Training data | SherryT997/IndicTTS-Deepfake @ `57347517658a`, CC-BY-4.0 |
| Split | language-stratified, text-disjoint, seed 0 |
| Threshold | 0.806183, fitted on our dev split |
| Class index | 1 = spoof, **verified** by construction |

Every element is traceable to a commit, a hash and a training run we performed.

### Dhwani (third-party)

| | |
|---|---|
| Model | `ayush2635/Dhwani-Multilingual-Deepfake-Audio-Detection-Model` |
| ONNX SHA-256 | `d1c232bf4d7990526804b375c15804c0ee4e9b566478b908c5a57431491b7342` |
| Size | 1,262,760,439 bytes |
| Repo | `ayush2635/Dhwani-Deepfake-Audio-Detection-API` @ `efd512c9` (single commit) |
| Licence | MIT (model and code) |
| Declared languages | English, Hindi, Tamil, Telugu, Malayalam |
| Declared input | 16 kHz mono, max 3 s / 48,000 samples |
| Architecture (declared) | Wav2Vec2 XLS-R 300M + "AASIST" |
| Threshold | **none** — ships uncalibrated |

## Verified properties, and four documented gaps

Measured directly against the artifact:

    input   float32[batch_size, time]   time axis genuinely dynamic
    output  float32[1, 2]               batch dimension HARD-CODED to 1
    metadata  producer 'pytorch', no custom metadata, no class labels

**1. Batching is silently broken.** batch=2 and batch=4 both return a single (1,2) row
with no error. A caller broadcasting that score across the batch would be confidently
wrong about every window but one. The adapter asserts the batch dimension on every call.

**2. The artifact is untraceable.** There is no ONNX export script anywhere in the
repository, and `src/api/config.py` refers to "the downloaded Kaggle model". The
published training code cannot be shown to have produced this file.

**3. Preprocessing is under-determined — three upstream descriptions disagree.**

| source | length | normalisation | extras |
|---|---|---|---|
| model card | 48,000 | zero-mean/unit-variance | — |
| `training/dataset.py` | 48,000 random crop | **none** | — |
| `src/api/inference.py` | 48,000 -> ZMUV -> pad to **64,000** | ZMUV pre-pad | logits / T=1.362 |

All three are selectable via `--dhwani-preprocessing card|train|serve`; the model card
is the default, being the contract published for external use.

**4. The class order could not be confirmed on our data.** Three upstream sources agree
index 1 is FAKE (`training/dataset.py` `# 0 = Real, 1 = Fake`, `inference.py`
`probs[0][1]`, and the model card), and the adapter follows that. We could not verify it,
because Dhwani does not discriminate on our data at all — see below. When a model is at
chance, neither orientation is distinguishable from the other. The contract is used on
authority, not evidence, and every result says so in its `notes` field.

## Measured behaviour on our Indic benchmark

120 bonafide + 120 spoof from our test split, five target languages, every combination of
the three preprocessing variants and both class orders:

| preprocessing | P(spoof) index | EER | 95 % CI | ROC-AUC |
|---|---:|---:|---|---:|
| card | 0 | 46.67 % | [40.0, 53.3] | 0.542 |
| card | 1 | 53.33 % | [46.7, 60.0] | 0.458 |
| train | 0 | 51.67 % | [45.8, 57.9] | 0.457 |
| train | 1 | 48.33 % | [42.1, 54.2] | **0.543** |
| serve | 0 | 46.67 % | [40.8, 52.5] | 0.540 |
| serve | 1 | 53.33 % | [47.5, 59.6] | 0.460 |

**Every configuration is at chance.** The best is 0.543 with a CI spanning 50 %.

Safety, on genuine speech only:

| condition | VoiceGuard | Dhwani |
|---|---:|---:|
| **clean genuine speech** | **0.0 %** | **100.0 %** |
| 25 % leading silence | 0.0 % | 100.0 % |
| 50 % trailing silence | 45.0 % | 100.0 % |
| turn-taking gaps | 21.7 % | 100.0 % |
| low-energy speech | 0.0 % | 100.0 % |
| 50 Hz mains hum | 100.0 % | 0.0 % |
| digital silence / white noise | 0.0 % | 0.0 % |

Dhwani flags essentially **all speech** as fake and scores **all non-speech** as real.
Its clean 0 % on mains hum is not a strength; it follows from the same behaviour.

Judged at 0.5, since it ships no threshold — but an AUC of 0.54 means no threshold would
rescue it.

## Interpretation

Our benchmark is out-of-domain for Dhwani: it was trained on Common Voice plus
IndicSynth, and our test set is SherryT997. These are nonetheless the five languages it
declares support for. The honest statement is:

> Dhwani is available as a selectable backend and runs correctly through the shared
> interface. On our Indic benchmark it performs at chance and flags nearly all genuine
> speech as synthetic. It is not a substitute for the adapted VoiceGuard detector here,
> and no claim is made about its performance on the data it was designed for.

Dhwani is not used in training, not used to label data, and not fused with VoiceGuard.
