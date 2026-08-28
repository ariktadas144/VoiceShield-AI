# Can training strategy break the bonafide/spoof trade-off?

Four experiments have now produced the same trade, and the diagnosis explains it: the
region containing unseen genuine speech (FLEURS) also contains the unseen generators
(xtts_v2, freevc24). IndicVoices is the nearest training population to *both*. Claiming
that region as "real" fixes FLEURS and blinds the model to unseen spoof, in one act.

The question is whether a training method can separate those two effects without
changing the data. **No training has been run.**

## Candidates evaluated

### 1. ASDG — single-side domain adversarial learning — **RECOMMENDED**

Xie, Cheng, Wang, Ye, *Domain Generalization via Aggregation and Separation for Audio
Deepfake Detection*, IEEE TIFS 2024; workshop variant SM-ASDG, DADA 2023.

A domain discriminator behind a Gradient Reversal Layer, trained **only on bonafide
samples**:

```
minmax L_ada(G,D) = - E_{x ~ P(X_r), y ~ Y_D}  Σ_d  p(y=d) log D(G(x))
   D    G
```

`X_r` is the real distribution — the discriminator never sees a spoof sample. GRL makes
the generator unable to identify which corpus a *real* clip came from, "which leads to the
aggregation of genuine speech in the feature space without being divided by domains",
while the fake class is deliberately left alone to stay separated.

```
L_all = L_BCE + λ1·L_ada + λ2·L_tri     λ1 = λ2 = 0.1, triplet margin α = 0.1
```

**Why this one.** It is the only method found whose stated objective is exactly our
measured failure — aggregate real across domains, do not aggregate fake. Everything else
either aligns both classes or compacts real. Its own paper uses **RawNet2 as the baseline
it beats** (EER reduced by up to 39.24%). We already have the domain labels it needs: three
bonafide sources, matching its three.

### 2. IDFE — full domain-adversarial — rejected

*Enhancing Multi-Corpus Training in SSL-Based Anti-Spoofing Models*, arXiv:2603.18657.
Same GRL machinery (α=0.1, λ ramped 0→1) but the discriminator sees **all** samples and
predicts corpus id. Pooled EER 6.11% → 4.88%.

Rejected because it would make spoof domains indistinguishable too. Our spoof side is
deliberately heterogeneous — Sherry spoof and SPRING_F5 separate at 0.981 — and collapsing
that is the opposite of what unseen-generator detection needs.

### 3. Multitask dataset-aware — rejected for now

*Leveraging Gradient Reversal Loss and Multitask Learning*, arXiv:2607.23961. An auxiliary
head predicts `(dataset, label)` jointly, **no** gradient reversal. Notably it **beat** GRL
in that paper: 13.14% vs 5.32% relative improvement, best on 9/14 datasets.

Worth recording as the strongest empirical competitor, but it makes the model *dataset
aware* rather than dataset invariant. Given our failure is a model over-fitting corpus
identity, deliberately encoding corpus identity is the wrong direction to try first. Also
demonstrated only at 315M params on 7,325 hours; we have 18.7M and ~11 hours.

### 4. OC-Softmax — rejected, and specifically risky for us

Zhang et al., *One-Class Learning Towards Synthetic Voice Spoofing Detection*, 2.19% EER on
ASVspoof 2019 LA, code at `yzyouzhang/AIR-ASVspoof`.

Compacts bonafide into a tight cluster with an angular margin pushing everything else away.
Strong for unseen attacks — but it works by **compacting real**, and our FLEURS failure is
precisely an unseen real domain falling outside the learned real region. Compacting that
region harder is a plausible way to make cell C and the safety numbers worse. It also
replaces the classification objective rather than adding to it.

### 5. MixStyle — deferred, complementary

Part of SM-ASDG; mixes feature statistics across the batch to synthesise novel domains.
Ablation shows it is worth 2.91/4.50 EER points there. Additive to option 1, but it is a
second variable and should not enter the same experiment.

## Exactly how ASDG applies to our pipeline

**`model.py` is not modified.** The 1024-d GRU embedding that feeds both heads
(`model.py:258`, `x = x[:,-1,:]`) is reachable as the *input* to `fc1_binary_gru`, so a
forward hook captures it with no architectural change:

```python
emb = {}
model.fc1_binary_gru.register_forward_hook(lambda m, inp, out: emb.__setitem__("z", inp[0]))
```

Verified: captures `(batch, 1024)`, and `output_binary` / `output_multi` are unchanged.

**The addition, training-only:**

```python
class GradReverse(torch.autograd.Function):        # ~8 lines
    @staticmethod
    def forward(ctx, x, lambd):
        ctx.lambd = lambd
        return x.view_as(x)
    @staticmethod
    def backward(ctx, g):
        return -ctx.lambd * g, None

domain_head = nn.Linear(1024, 3)                   # Sherry | OpenSLR | IndicVoices

# per batch, AFTER the normal forward:
real = (labels == 0)                               # SINGLE-SIDED: bonafide only
if real.any():
    z = GradReverse.apply(emb["z"][real], lam)     # lam ramps 0 -> 1
    loss = loss_bce + 0.1 * F.cross_entropy(domain_head(z), domain_ids[real])
```

* **Domain label**: `source` field already in every manifest row — SherryT997, OpenSLR,
  IndicVoices. Spoof rows are masked out, so no label is needed for them.
* **Cost**: 3,075 parameters, **0.016%** of 18,678,185. One extra linear per batch. No
  measurable VRAM or time impact on the 4 GB card.
* **At inference**: the head and hook are discarded. The deployed forward path is
  byte-identical to v1's, so `detect.py`, the Dhwani backend selector and every existing
  checkpoint loader are untouched.
* **Unchanged**: architecture, sample rate, optimiser, NLLLoss on the main head,
  schedule, normalisation, trimming, batch size, seed, and both the spoof and bonafide
  data.

The one substantive change would be: **+0.1 × single-side domain-adversarial loss.**

## What it would and would not prove

The theory of change is specific and falsifiable: if the model currently separates real
from fake partly by *recognising which corpus a clip is from*, then forcing the bonafide
representation to be corpus-invariant should let it cover an unseen real domain (FLEURS)
without having to claim the raw acoustic territory where xtts_v2 and freevc24 live —
breaking the coupling that the dose experiment showed is not breakable by data.

Honest uncertainty, recorded before any run:

* ASDG was validated on LCNN/W2V2 with 27k clips and three domains. We would apply it to a
  GRU embedding with 7k clips and three domains. The domain count matches; the backbone
  and scale do not.
* Adversarial training on **840 IndicVoices clips** spread over three domains is a thin
  signal, and GRL is known to be unstable at small scale. A collapsed or non-converging
  discriminator would show up as the domain loss pinning at chance (ln 3 ≈ 1.10).
* It cannot manufacture a synthesis cue that is not there. If xtts_v2 and freevc24 are
  genuinely indistinguishable from real speech to a 4-second RawNet2 receptive field, no
  loss term fixes that — and the honest outcome would be that the trade is a capacity
  limit rather than a training-strategy one.

Recommended if run: **iv15 as the initialisation and its exact dataset**, since that is the
current best all-round model, changing only the loss. That isolates the method from the
dose.
