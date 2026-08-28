import json, random, sys
from pathlib import Path
import numpy as np, torch, soundfile as sf
sys.path.insert(0, "models/spectra_aasist"); sys.path.insert(0,"benchmark")
from model import SpectraAASIST
from pilot_audit import auc
NB_SAMP, SR, dev = 64400, 16000, "cuda"
torch.cuda.reset_peak_memory_stats()
m = SpectraAASIST.from_pretrained("models/spectra_aasist").to(dev).eval()
print(f"  weights on GPU: {torch.cuda.memory_allocated()/2**20:.0f} MiB", flush=True)
print(f"  parameters: {sum(p.numel() for p in m.parameters())/1e6:.1f} M", flush=True)
def load_clip(p):
    y,sr=sf.read(p,dtype="float32",always_2d=True); y=y.mean(axis=1)
    if sr!=SR:
        import soxr; y=soxr.resample(y,sr,SR).astype(np.float32)
    return (y[:NB_SAMP] if len(y)>=NB_SAMP else np.tile(y,int(NB_SAMP/len(y))+1)[:NB_SAMP])
rows=[json.loads(l) for l in open("data/mixed_f5_iv15/manifest.jsonl") if l.strip()]
rng=random.Random(0)
g=[r for r in rows if r["split"]=="test" and r["label"]==0]
s=[r for r in rows if r["split"]=="test" and r["label"]==1]
rng.shuffle(g); rng.shuffle(s)
sel=[(r,0) for r in g[:40]]+[(r,1) for r in s[:40]]
X=np.stack([load_clip(Path(r["path"])) for r,_ in sel]); y=np.array([l for _,l in sel])
torch.cuda.reset_peak_memory_stats(); outs=[]
with torch.no_grad():
    for i in range(0,len(X),8):
        outs.append(m(torch.from_numpy(X[i:i+8]).float().to(dev)).cpu().numpy())
lg=np.concatenate(outs); peak8=torch.cuda.max_memory_allocated()/2**20
print(f"  output {lg.shape}  col0 [{lg[:,0].min():.2f},{lg[:,0].max():.2f}]  col1 [{lg[:,1].min():.2f},{lg[:,1].max():.2f}]", flush=True)
print("\n  PHASE 3 -- class order, 40 known-genuine + 40 known-spoof", flush=True)
for n,sc in [("logits[:,1] (card=bonafide)",lg[:,1]),("logits[:,0] (card=spoof)",lg[:,0]),
             ("-logits[:,1] negated",-lg[:,1]),("softmax[:,0]",np.exp(lg[:,0])/np.exp(lg).sum(1))]:
    print(f"    {n:30s} AUC(spoof>genuine)={auc(sc[y==1],sc[y==0]):.3f}", flush=True)
print(f"\n  mean logits[:,1]: genuine {lg[y==0,1].mean():+.3f}  spoof {lg[y==1,1].mean():+.3f}", flush=True)
torch.cuda.reset_peak_memory_stats()
with torch.no_grad(): m(torch.from_numpy(X[:1]).float().to(dev))
print(f"\n  PHASE 4 -- VRAM: resident {torch.cuda.memory_allocated()/2**20:.0f} MiB | "
      f"peak b8 {peak8:.0f} | peak b1 {torch.cuda.max_memory_allocated()/2**20:.0f} | "
      f"GPU total {torch.cuda.get_device_properties(0).total_memory/2**20:.0f} MiB", flush=True)
