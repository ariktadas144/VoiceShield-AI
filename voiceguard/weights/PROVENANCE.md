# Pretrained weights provenance

## pre_trained_DF_RawNet2.pth

| field | value |
|---|---|
| Source | https://www.asvspoof.org/asvspoof2021/pre_trained_DF_RawNet2.zip |
| Upstream repo | https://github.com/asvspoof-challenge/2021 (`LA/Baseline-RawNet2`) |
| Retrieved | 2026-08-25 |
| File mtime | 2021-05-31 |
| Size | 70515422 bytes |
| SHA-256 | `52d8ad5f524a0f600c7c876d7a157a8f06c44a03504d0b2795c852f5e42c9127` |
| Trained on | ASVspoof 2019 LA train partition (DF track baseline) |
| Sample rate | 16 kHz (`SincConv(sample_rate=16000)`) |
| Output | 2 classes, `--loss=CCE` |

Verified to load into this fork's `RawNet` with a two-key rename
(`fc1_gru`->`fc1_binary_gru`, `fc2_gru`->`fc2_binary_gru`): **119/123 tensors,
0 unexpected, 94.3% of parameters**. See `tests/test_equivalence.py`.

## tests/official_rawnet2_reference.py

Verbatim copy of `asvspoof-challenge/2021` `LA/Baseline-RawNet2/model.py`, kept
only as the reference implementation for the equivalence regression test. Not
imported by VoiceGuard at runtime.
