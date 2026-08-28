"""Freeze everything needed to reproduce the pilot generation bit-for-bit.

Model revisions, file hashes, licences, package versions, device, and the exact
generation parameters each generator was run with. Written as JSON so the pilot report
quotes measurements rather than recollections.
"""

from __future__ import annotations

import hashlib
import json
import platform
import subprocess
import sys
from pathlib import Path

REPOS = {
    "spring_f5": "generators/spring_f5",
    "indic_mio": "generators/indic_mio",
    "miocodec": "generators/miocodec",
}
KEY_FILES = {
    "spring_f5": ["config.json", "checkpoints/vocab.txt",
                  "checkpoints/model_170000_ema.safetensors"],
    "indic_mio": ["config.json", "generation_config.json", "chat_template.jinja"],
    "miocodec": ["config.yaml"],
}


def sha256(p: Path, cap: int = 2 << 30) -> str | None:
    if not p.exists() or p.stat().st_size > cap:
        return None
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for c in iter(lambda: fh.read(8 << 20), b""):
            h.update(c)
    return h.hexdigest()


def main() -> int:
    rec: dict = {"generated_by": __file__}

    dl = Path("generators/DOWNLOAD_RECORD.json")
    rec["models"] = json.load(open(dl)) if dl.exists() else {}

    ema = Path("generators/spring_f5/checkpoints/EMA_EXTRACTION.json")
    if ema.exists():
        rec["spring_f5_ema_extraction"] = json.load(open(ema))

    rec["file_hashes"] = {}
    for name, root in REPOS.items():
        for rel in KEY_FILES.get(name, []):
            p = Path(root) / rel
            rec["file_hashes"][f"{name}/{rel}"] = {
                "sha256": sha256(p), "bytes": p.stat().st_size if p.exists() else None}

    try:
        import torch
        rec["environment"] = {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "torch": torch.__version__,
            "cuda_available": torch.cuda.is_available(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "gpu_total_MiB": (torch.cuda.get_device_properties(0).total_memory >> 20)
            if torch.cuda.is_available() else None,
        }
        for m in ("transformers", "torchaudio", "miocodec", "soundfile", "numpy"):
            try:
                rec["environment"][m] = __import__(m).__version__
            except Exception:
                rec["environment"][m] = None
    except Exception as exc:
        rec["environment"] = {"error": str(exc)}

    try:
        rec["environment"]["pip_freeze"] = subprocess.run(
            [".venv-gen/bin/pip", "freeze"], capture_output=True, text=True,
            timeout=120).stdout.splitlines()
    except Exception:
        pass

    # generation settings actually used, read back from the manifests rather than
    # restated from the scripts
    rec["generation"] = {}
    for name in ("spring_f5", "indic_mio"):
        man = Path("data/pilot_spoof") / name / "manifest.jsonl"
        if not man.exists():
            continue
        rows = [json.loads(l) for l in open(man)]
        keys = ("temperature", "top_p", "dtype", "sample_rate")
        rec["generation"][name] = {
            "n_clips": len(rows),
            "distinct_seeds": len({r["seed"] for r in rows}),
            "settings": {k: sorted({r[k] for r in rows if k in r}) for k in keys},
            "languages": {l: sum(1 for r in rows if r["language"] == l)
                          for l in sorted({r["language"] for r in rows})},
        }
    rec["generation"]["shared"] = {
        "items_file": "data/pilot_refs/pilot_items.jsonl",
        "references_file": "data/pilot_refs/references.jsonl",
        "reference_seed": 1234, "item_pairing_seed": 1234, "generation_base_seed": 1234,
        "per_clip_seed": "sha256(f'{base}:{item_id}')[:4] as big-endian uint32",
        "identical_inputs_for_both_generators": True,
    }
    for f in ("data/pilot_refs/references.jsonl", "data/pilot_refs/pilot_items.jsonl"):
        rec["file_hashes"][f] = {"sha256": sha256(Path(f)),
                                 "bytes": Path(f).stat().st_size if Path(f).exists() else None}

    out = Path("data/pilot_spoof/PROVENANCE.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    json.dump(rec, open(out, "w"), indent=2)
    print(f"wrote {out}")
    for k, v in rec.get("models", {}).items():
        print(f"  {k:34s} rev={v['revision'][:12]} lic={v['license']}")
    for k, v in rec.get("generation", {}).items():
        if isinstance(v, dict) and "n_clips" in v:
            print(f"  {k:34s} {v['n_clips']} clips, {v['distinct_seeds']} seeds")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
