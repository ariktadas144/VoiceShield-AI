"""ASDG with DOMAIN-BALANCED auxiliary exposure -- one variable changed from train_asdg.py.

The first ASDG run collapsed because the discriminator was starved: per batch of 32 it saw
Sherry 10.1, OpenSLR 4.1, IndicVoices 1.9, with 42% of batches carrying at most one
IndicVoices sample. A probe on frozen embeddings showed the information was there all
along -- balanced batches recover IndicVoices at 62.5% where the real mix recovers 25.0%.

Class-weighted loss was tried first because it needs no extra forward pass and leaves the
main batch untouched. It is not enough: on the same frozen embeddings it lifts IndicVoices
only to 40.9%. Weighting amplifies a sparse signal, it does not densify one, and it can do
nothing at all about the 13.2% of batches containing no IndicVoices sample.

So L_ada is computed on a separate DOMAIN-BALANCED draw of bonafide clips, 5 per domain
per step. Two properties are preserved deliberately:

  * L_BCE and L_tri are still computed on the ORIGINAL main batch, so the binary
    detector's training distribution is exactly what iv15 and the first ASDG run saw.
  * The auxiliary pass runs with BatchNorm in eval mode, so it uses -- and does not
    update -- the running statistics. Without this the extra forward would quietly shift
    the normalisation the whole network depends on, which is a change to the main
    detector by the back door.

Everything else is identical to train_asdg.py: objective, lambdas, margin, GRL schedule,
hinge interpretation, dataset, splits, preprocessing, optimizer, seed, checkpoint rule.

ASDG: aggregate bonafide across recording domains, leave spoof free to differ.

Xie, Cheng, Wang, Ye, "Domain Generalization via Aggregation and Separation for Audio
Deepfake Detection", IEEE TIFS 2024; workshop variant SM-ASDG, DADA 2023.

    L_all = L_BCE + λ1·L_ada + λ2·L_tri          λ1 = λ2 = 0.1

L_ada is a domain discriminator behind a Gradient Reversal Layer trained on the REAL
distribution only:

    minmax L_ada(G,D) = − E_{x~P(X_r), y~Y_D}  Σ_d p(y=d) log D(G(x))
       D    G

Spoof samples never enter it. That single-sidedness is the whole point: our four previous
experiments showed that widening "real" to cover an unseen genuine domain also widens it
over unseen generators, because IndicVoices is the nearest training population to both
xtts_v2 (1.45) and freevc24 (1.98). Ordinary DANN/IDFE would align the spoof domains too
and collapse the Sherry-vs-SPRING_F5 difference we deliberately built.

L_tri is the separation half, Eq. 3 of the paper:

    L_tri = Σ_i ‖f(x_a) − f(x_r)‖²₂ − ‖f(x_a) − f(x_f)‖²₂ + α,   α = 0.1

TWO FAITHFUL ADAPTATIONS, both reported rather than silently made:

1. The paper writes Eq. 3 without a hinge. Taken literally the term is unbounded below --
   the model would minimise it by pushing the fake distance to infinity, and nothing else
   would matter. Every practical triplet implementation clamps at zero, so max(0, ·) is
   applied. This is the standard reading of the equation, not a substitute objective.

2. λ is described only as "negative dynamic coefficients", with GRL cited to Ganin &
   Lempitsky (ICML 2015). Their schedule is therefore inherited verbatim:
   λ_p = 2/(1+exp(−10p)) − 1 over training progress p. IDFE independently reports the same
   0→1 ramp.

The triplet positive is drawn from a DIFFERENT domain than the anchor wherever the batch
allows it, since "real speech from different domain should be aggregated" is the stated
goal; a same-domain positive would not exercise it.

The domain head is TRAINING ONLY. model.py is untouched: the 1024-d GRU embedding is
captured as the input to fc1_binary_gru via a forward hook, so the deployed forward path
stays byte-identical and detect.py, the Dhwani backend selector and every checkpoint
loader keep working unchanged.
"""

from __future__ import annotations

import argparse
import random
import copy
import json
import math
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import yaml
from torch import nn
from torch.utils.data import DataLoader

from main import Dataset_Indic, score_split, set_seed, SPOOF_INDEX
from metrics import compute_eer
from model import RawNet

DOMAINS = {"SherryT997": 0, "OpenSLR": 1, "IndicVoices": 2}


class GradReverse(torch.autograd.Function):
    """Identity forwards; scaled sign-flip backwards."""

    @staticmethod
    def forward(ctx, x, lambd):
        ctx.lambd = lambd
        return x.view_as(x)

    @staticmethod
    def backward(ctx, grad):
        return -ctx.lambd * grad, None


def grl_lambda(progress: float, gamma: float = 10.0) -> float:
    """Ganin & Lempitsky's schedule, cited by the ASDG paper for its GRL."""
    return 2.0 / (1.0 + math.exp(-gamma * progress)) - 1.0


class Dataset_ASDG(Dataset_Indic):
    """Dataset_Indic plus a domain id per clip. Spoof clips carry -1 and are masked out."""

    def __init__(self, *a, domain_map=None, **kw):
        super().__init__(*a, **kw)
        self.domain_map = domain_map or {}

    def __getitem__(self, index):
        x, label = super().__getitem__(index)
        path = self.items[index][0]
        return x, label, self.domain_map.get(str(path), -1)


def build_domain_map(manifest_jsonl: Path) -> dict:
    m = {}
    for line in open(manifest_jsonl):
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("label") == 0 and r.get("source") in DOMAINS:
            m[str(r["path"])] = DOMAINS[r["source"]]
    return m


def triplet_term(z, labels, domains, margin=0.1):
    """Eq. 3, hinged. Anchor = real; positive = real from another domain; negative = fake."""
    real = (labels == 0).nonzero(as_tuple=True)[0]
    fake = (labels == 1).nonzero(as_tuple=True)[0]
    if real.numel() < 2 or fake.numel() < 1:
        return z.new_zeros(())
    a_idx, p_idx, n_idx = [], [], []
    for i in real.tolist():
        cross = [j for j in real.tolist() if j != i and domains[j] != domains[i]]
        pool = cross if cross else [j for j in real.tolist() if j != i]
        if not pool:
            continue
        a_idx.append(i)
        p_idx.append(pool[torch.randint(len(pool), (1,)).item()])
        n_idx.append(fake[torch.randint(fake.numel(), (1,)).item()].item())
    if not a_idx:
        return z.new_zeros(())
    a, p, n = z[a_idx], z[p_idx], z[n_idx]
    d_pos = (a - p).pow(2).sum(1)
    d_neg = (a - n).pow(2).sum(1)
    return F.relu(d_pos - d_neg + margin).mean()


class BalancedDomainSampler:
    """Yields an index list with an equal number of bonafide clips per domain."""

    def __init__(self, domains_by_index, per_domain, seed=1234):
        self.by = {}
        for i, d in domains_by_index.items():
            self.by.setdefault(d, []).append(i)
        self.per = per_domain
        self.rng = random.Random(seed)
        for v in self.by.values():
            self.rng.shuffle(v)
        self.pos = {d: 0 for d in self.by}

    def draw(self):
        out = []
        for d, pool in self.by.items():
            for _ in range(self.per):
                if self.pos[d] >= len(pool):
                    self.rng.shuffle(pool)
                    self.pos[d] = 0
                out.append(pool[self.pos[d]])
                self.pos[d] += 1
        return out


def _set_bn_eval(model, on=True):
    """BatchNorm to eval for the auxiliary pass, so running stats stay owned by the
    main batch. Anything else would change the main detector indirectly."""
    for m in model.modules():
        if isinstance(m, (nn.BatchNorm1d, nn.BatchNorm2d)):
            m.eval() if on else m.train()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--manifests", default="data/mixed_f5_iv15")
    ap.add_argument("--model_save_path", default="checkpoints_asdg_bal")
    ap.add_argument("--config", default="model_config_RawNet.yaml")
    ap.add_argument("--init-ckpt", default="checkpoints_f5_iv15/best_model.pth")
    ap.add_argument("--batch_size", type=int, default=32)
    ap.add_argument("--num_epochs", type=int, default=30)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--weight_decay", type=float, default=1e-4)
    ap.add_argument("--num_workers", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--lambda-ada", type=float, default=0.1)
    ap.add_argument("--lambda-tri", type=float, default=0.1)
    ap.add_argument("--margin", type=float, default=0.1)
    ap.add_argument("--aux-per-domain", type=int, default=5,
                    help="bonafide clips per domain in the balanced auxiliary draw")
    ap.add_argument("--trim", action="store_true", default=True)
    ap.add_argument("--lr_patience", type=int, default=3)
    ap.add_argument("--early_stop_patience", type=int, default=10)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    set_seed(args.seed)
    cfg = yaml.safe_load(open(args.config))["model"]
    nb_samp, sr = cfg["nb_samp"], cfg.get("sample_rate", 16_000)

    dm = build_domain_map(Path(args.manifests) / "manifest.jsonl")
    common = dict(nb_samp=nb_samp, sample_rate=sr, normalise=True, trim=args.trim)
    tr = Dataset_ASDG(Path(args.manifests) / "train.txt", domain_map=dm, **common)
    dv = Dataset_Indic(Path(args.manifests) / "dev.txt", **common)
    tl = DataLoader(tr, batch_size=args.batch_size, shuffle=True, drop_last=True,
                    num_workers=args.num_workers, pin_memory=True)
    dl = DataLoader(dv, batch_size=args.batch_size, shuffle=False,
                    num_workers=args.num_workers, pin_memory=True)

    dom_by_idx = {i: dm[str(pth)] for i, (pth, lab) in enumerate(tr.items)
                  if lab == 0 and str(pth) in dm}
    sampler = BalancedDomainSampler(dom_by_idx, args.aux_per_domain, seed=args.seed)
    print(f"balanced auxiliary draw: {args.aux_per_domain} per domain "
          f"= {args.aux_per_domain*len(DOMAINS)} clips/step, pools "
          f"{ {d: len(v) for d, v in sampler.by.items()} }", flush=True)

    model = RawNet(copy.deepcopy(cfg), device).to(device)
    blob = torch.load(args.init_ckpt, map_location=device, weights_only=True)
    model.load_state_dict(blob["state_dict"])
    print(f"init: {args.init_ckpt} (epoch {blob.get('epoch')}, "
          f"dev EER {100*blob.get('dev_eer', float('nan')):.2f}%)", flush=True)

    # training-only head; model.py untouched
    emb = {}
    hook = model.fc1_binary_gru.register_forward_hook(
        lambda m, inp, out: emb.__setitem__("z", inp[0]))
    domain_head = nn.Linear(cfg["gru_node"], len(DOMAINS)).to(device)

    criterion = nn.NLLLoss()
    opt = torch.optim.Adam(list(model.parameters()) + list(domain_head.parameters()),
                           lr=args.lr, weight_decay=args.weight_decay)
    sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, factor=0.5,
                                                       patience=args.lr_patience)
    # The three domains are IMBALANCED, so uniform chance is the wrong yardstick.
    # Always predicting the majority domain already scores 62.5%, and a head that merely
    # reproduces the marginal distribution reaches CE 0.896, not ln3 = 1.099. Reading a
    # 62% domain accuracy as "still learning" when it is actually majority-class collapse
    # would invert the conclusion of this experiment, so both references are printed.
    counts = np.bincount([v for v in dm.values() if v >= 0], minlength=len(DOMAINS))
    prior = counts / counts.sum()
    maj = 100 * prior.max()
    ce_marginal = float(-(prior * np.log(prior + 1e-12)).sum())
    n_dom = int(counts.sum())
    print(f"train={len(tr)} dev={len(dv)}  domain-labelled bonafide={n_dom}  "
          f"lambda_ada={args.lambda_ada} lambda_tri={args.lambda_tri} margin={args.margin}",
          flush=True)
    print(f"domain prior {dict(zip(DOMAINS, counts.tolist()))} -> "
          f"majority-class acc {maj:.1f}%, marginal CE {ce_marginal:.3f} "
          f"(uniform chance would be 33.3% / {math.log(3):.3f})", flush=True)
    print("  aggregation succeeded  -> domain acc falls TOWARD 33.3% and CE rises",
          flush=True)
    print("  discriminator collapsed-> domain acc sits AT ~62.5% with CE ~0.896", flush=True)

    Path(args.model_save_path).mkdir(parents=True, exist_ok=True)
    best_eer, best_ep, hist = float("inf"), 0, []
    for ep in range(args.num_epochs):
        model.train(); domain_head.train()
        agg = dict(bce=0.0, ada=0.0, tri=0.0, dom_ok=0, dom_n=0, ok=0, n=0,
                   per_ok=[0]*len(DOMAINS), per_n=[0]*len(DOMAINS))
        for bi, (x, y, d) in enumerate(tl):
            p = (ep + bi / len(tl)) / args.num_epochs
            lam = grl_lambda(p)
            x, y, d = x.to(device), y.to(device), d.to(device)
            opt.zero_grad()
            binary, _ = model(x)
            z = emb["z"]
            l_bce = criterion(binary, y)

            # L_tri stays on the MAIN batch -- unchanged from the first ASDG run
            l_tri = triplet_term(z, y, d, args.margin)

            # L_ada on a domain-BALANCED auxiliary draw; BN frozen so the main batch
            # keeps sole ownership of the running statistics
            aux_idx = sampler.draw()
            ax = torch.stack([torch.from_numpy(np.ascontiguousarray(tr[i][0]))
                              for i in aux_idx]).float().to(device)
            ad = torch.tensor([dom_by_idx[i] for i in aux_idx], device=device)
            _set_bn_eval(model, True)
            model(ax)
            _set_bn_eval(model, False)
            za = emb["z"]
            logits = domain_head(GradReverse.apply(za, lam))
            l_ada = F.cross_entropy(logits, ad)
            pred = logits.argmax(1)
            for k in range(len(DOMAINS)):
                mk = ad == k
                if mk.any():
                    agg["per_ok"][k] += (pred[mk] == k).sum().item()
                    agg["per_n"][k] += int(mk.sum())
            agg["dom_ok"] += (pred == ad).sum().item(); agg["dom_n"] += ad.numel()

            (l_bce + args.lambda_ada * l_ada + args.lambda_tri * l_tri).backward()
            opt.step()
            bs = y.size(0)
            agg["bce"] += l_bce.item() * bs; agg["ada"] += float(l_ada) * bs
            agg["tri"] += float(l_tri) * bs
            agg["ok"] += (binary.argmax(1) == y).sum().item(); agg["n"] += bs

        s, l = score_split(dl, model, device)
        eer, thr = compute_eer(s, l)          # same call main.py makes
        dom_acc = 100 * agg["dom_ok"] / max(1, agg["dom_n"])
        per_rec = [100 * agg["per_ok"][k] / max(1, agg["per_n"][k])
                   for k in range(len(DOMAINS))]
        bal_acc = sum(per_rec) / len(per_rec)
        row = {"epoch": ep + 1, "bce": agg["bce"] / agg["n"], "ada": agg["ada"] / agg["n"],
               "tri": agg["tri"] / agg["n"], "train_acc": 100 * agg["ok"] / agg["n"],
               "dev_eer": eer, "domain_acc": dom_acc, "domain_bal_acc": bal_acc,
               "per_domain_recall": per_rec, "grl_lambda": lam,
               "pred_spoof": float((s >= thr).mean())}
        hist.append(row)
        print(f"epoch {ep+1}/{args.num_epochs}  bce={row['bce']:.4f} "
              f"ada={row['ada']:.4f} tri={row['tri']:.4f}  train_acc={row['train_acc']:.2f}% "
              f"| dev_EER={100*eer:.2f}%  dom_bal_acc={bal_acc:.1f}% "
              f"(chance 33.3) recall S/O/I="
              f"{per_rec[0]:.0f}/{per_rec[1]:.0f}/{per_rec[2]:.0f}  lambda={lam:.3f}",
              flush=True)

        if eer < best_eer:
            best_eer, best_ep = eer, ep + 1
            torch.save({"state_dict": model.state_dict(), "config": cfg, "dev_eer": eer,
                        "threshold": thr, "epoch": ep + 1, "seed": args.seed,
                        "normalise": True, "trim": args.trim, "init": "checkpoint",
                        "align_head": True, "spoof_index": SPOOF_INDEX, "rawboost": 0,
                        "init_ckpt": args.init_ckpt, "asdg": True, "asdg_balanced": True,
                        "lambda_ada": args.lambda_ada, "lambda_tri": args.lambda_tri},
                       Path(args.model_save_path) / "best_model.pth")
            print(f"  saved: dev EER {100*eer:.2f}%, threshold {thr:.4f}", flush=True)
        sched.step(eer)
        if ep + 1 - best_ep >= args.early_stop_patience:
            print(f"early stop at epoch {ep+1}", flush=True); break

    hook.remove()
    json.dump(hist, open(Path(args.model_save_path) / "history.json", "w"), indent=2)
    print(f"\nbest dev EER: {100*best_eer:.2f}% at epoch {best_ep} "
          f"-> {args.model_save_path}/best_model.pth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
