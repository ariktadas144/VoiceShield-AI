# INDICSYNTH_AUDIT.md — size, structure, and a blocking finding

Metadata-only audit. **Nothing was downloaded.**

## Size

845.2 GB total, 12 language configs, 1,412 shards.

| language | shards | download GB | rows | target? |
|---|---:|---:|---:|---|
| Sanskrit | 396 | 167.2 | 377,504 | |
| **Tamil** | 171 | **148.5** | 282,312 | ✅ |
| Punjabi | 134 | 100.6 | 248,354 | |
| **Telugu** | 129 | **91.7** | 169,896 | ✅ |
| Kannada | 91 | 68.4 | 115,023 | |
| **Hindi** | 107 | **56.0** | 205,938 | ✅ |
| Gujarati | 72 | 50.8 | 118,778 | |
| Marathi | 144 | 42.6 | 130,150 | |
| Urdu | 48 | 37.8 | 94,898 | |
| Bengali | 54 | 33.6 | 83,448 | |
| **Malayalam** | 32 | **24.4** | 34,128 | ✅ |
| Odia | 34 | 23.7 | 52,236 | |

**Target subtotal: 320.6 GB** against 70 GB free — full download was never viable, which
is why access mechanism matters more than size.

## Access mechanisms (verified in this project)

| mechanism | works | cost |
|---|---|---|
| per-language config | yes | whole language |
| per-shard download | yes | ~500 MB per shard |
| **per-clip via rows API** | **yes** | **~570 KB/clip, metadata attached** |
| streaming | yes | generator-contiguous, so `.skip()` walks rows |
| per-generator config | **no** | must filter on metadata |

The rows API is what we used for MMS-TTS and is the only mechanism that scales to a
laptop: it fetches only the clips kept. 2,000 clips ≈ 1.1 GB, no shard download, no Arrow
duplicate.

`load_dataset()` writes an Arrow copy **in addition** to the parquet — measured ~2x on
disk — so it should be avoided for anything large.

## The blocking finding

Our external test set (`data/external2`) draws its spoof side from IndicSynth
**xtts_v2 and freevc24**. Both are therefore held out; training on either contaminates
cells B and D.

The dataset card advertises three generators: xtts_v2, **vits**, freevc24.

32 probe points across the four target languages — 8 offsets each, spanning 2 % to 98 %
of every config's row range — returned **only xtts_v2 and freevc24**:

| language | generators observed | trainable after held-out exclusion |
|---|---|---|
| Hindi | freevc24, xtts_v2 | **none** |
| Tamil | freevc24, xtts_v2 | **none** |
| Telugu | freevc24, xtts_v2 | **none** |
| Malayalam | freevc24, xtts_v2 | **none** |

**`vits` was not observed in any target language.** Probes of the eight non-target
languages were rate-limited by the datasets-server and are inconclusive, so its absence
corpus-wide is not established — only its absence from our four targets, which is what
matters here.

### Consequence

> **IndicSynth contains no generator we can train on without destroying our held-out
> evaluation.**

Training on xtts_v2 or freevc24 would make cells B and D self-referential: the model
would be evaluated on generators it had seen. Every cross-generator number reported so
far — including v2's D improvement — depends on those two remaining unseen.

This is precisely what the held-out-generator check exists to catch, and it stops the
plan before any download rather than after 320 GB.

## Options, none of which require IndicSynth

1. **Give up one held-out generator.** Train on freevc24, keep xtts_v2 held out. Halves
   the evaluation's generator diversity and makes v0/v1/v2/v3's B and D numbers
   non-comparable with anything that follows.
2. **Find a genuinely independent generator.** The reason to want IndicSynth was generator
   diversity; a source whose generators are not already our test set serves that better.
3. **Re-partition.** Introduce a third generator family as the new held-out set and free
   both IndicSynth generators for training. Costs a full re-evaluation of every prior
   model, and no such family is currently in hand.

Option 1 is cheapest and worst for evidence. Option 2 preserves the evaluation but needs a
dataset search. Option 3 is the most principled and the most expensive.

## Licence, recorded regardless

| | |
|---|---|
| Dataset | `vdivyasharma/IndicSynth` |
| Licence | **CC BY-NC 4.0** — non-commercial |
| Generators | xtts_v2, freevc24 (vits advertised, not observed in target languages) |
| Current use | **evaluation only** — the external spoof side |
| Restriction | any checkpoint trained on it is research/restricted provenance |


## Alternative independent spoof sources — searched, none viable

Per the rule that sacrificing the held-out benchmark is a last resort, alternatives were
audited before considering that:

| candidate | languages | generators | licence | verdict |
|---|---|---|---|---|
| `satwc-reddy/indian-language-deepfake-speech` | ta/te/ml/kok | MMS-TTS only (sigvc is pitch-shifted real speech; rvc has 0 files) | CC-BY-4.0 | **already used in v2/v3** — one family, exhausted |
| `bc7ec356/synthetic-speech-indic` | ~12 Indic | undocumented | **none declared** | rejected — 146 files (~12/language), no licence |
| `shunyalabs/synthetic-speech-indic` | ~12 Indic | undocumented | **none declared** | rejected — identical contents, no licence |
| **Indic-CodecFake** | 12 Indic | **8 NAC families** (DAC, Encodec, SNAC, SoundStream, SpeechTokenizer, FunCodec, AudioDec, MIMI) | unstated | **not publicly downloadable** — absent from HF under every author/name tried |
| `CodeVault-girish/Neural-Codecs` | n/a (pipeline) | the 8 NAC families above | **none declared** | pipeline exists, unlicensed, and using it means generating our own corpus |
| `ggirishg/Expressive_CodecFake` | not Indic | codec | CC-BY-4.0 | rejected — 48 files, wrong language |
| `rogertseng/CodecFake`, `CodecFake/CodecFake_Plus_Dataset`, `ajaykarthick/codecfake-audio` | English / Mandarin | 8+ codec families | varies | **wrong languages**, but the only accessible multi-generator spoof corpora |

Indic-CodecFake would have been the ideal answer — eight generator families entirely
disjoint from our held-out xtts_v2/freevc24, in exactly our languages, addressing a threat
class both our models are blind to. It is not released.

**Conclusion: no independent, adequately licensed, Indic multi-generator spoof corpus is
currently obtainable.** The download plan required by Phase 29 therefore cannot be
produced, because there is nothing safe to download.
