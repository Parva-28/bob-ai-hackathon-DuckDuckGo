# NOTES.md — Track 1: Vision Classifier

**Owner:** Teammate A (Track 1)
**Directory:** `src/models/vision/`
**Status:** Implementation complete; fill in measured metrics after training

---

## Dataset Split

- **Source:** WM-811K / LSWMD (downloaded from Kaggle: `qingyi/wm811k-wafer-map`)
- **Total records in raw pkl:** 811,457
- **Labeled records (any real defect class or explicit "None"):** ~125,000
  - Of these, ~25,519 have a non-None defect class label (~14.8% of total)
  - "None" class is subsampled to 25% of available records to prevent dominance
- **After subsampling:** ~TBD records (fill in after running `data_prep.py`)
- **Split:** 85% train / 15% validation, stratified by class
- **Random seed:** 42 (reproducible)
- **Image normalisation:** All maps resized to 64×64 with nearest-neighbour interpolation;
  pixel values (0/1/2) scaled to [0.0, 0.5, 1.0]

---

## Training Configuration

| Parameter       | Value                          |
|-----------------|-------------------------------|
| Architecture    | WaferCNN (ResNet-style, **615,801** params) |
| Epochs          | 40                            |
| Batch size      | 128                           |
| Optimiser       | Adam, lr=1e-3, weight_decay=1e-4 |
| LR schedule     | CosineAnnealingLR (T_max=40)  |
| Loss            | CrossEntropyLoss with **sqrt** inverse-frequency class weights |
| Sampler         | None — plain shuffle          |
| Augmentation    | Random h-flip, v-flip, 90° rotation (train only) |
| Inference       | TTA-8 (4 rotations × 2 flips, softmax averaged) |
| Device          | CUDA if available, else CPU    |

Produced by `colab/train_simple.ipynb`. `train.py` still encodes the v1 recipe
(`ReduceLROnPlateau` + full inverse-frequency weights + `WeightedRandomSampler`) and is
**superseded** — see "What actually moved the number" below.

---

## Results (Official Final Run on WM-811K Held-Out Split)

**Plain:** macro-F1 **0.9157**, accuracy **0.9568**
**With TTA-8:** macro-F1 **0.9232**, accuracy **0.9617** (delta **+0.0075**)

Measured on our own held-out split, 9,357 maps. Accuracy is quoted only for context:
"None" is 59% of the split, so the trivial "predict None always" baseline already scores
0.591 — macro-F1 is the number that means anything here.

| Class | Support | v1 F1 | Plain F1 | TTA F1 | TTA delta | Note |
|-------|---------|-------|----------|--------|-----------|------|
| Center | 644 | 0.924 | 0.954 | 0.959 | +0.005 | |
| Donut | 83 | 0.810 | 0.905 | 0.906 | +0.001 | 83 val samples — treat with caution |
| Edge-Loc | 779 | 0.834 | 0.883 | 0.903 | +0.020 | Largest TTA gain |
| Edge-Ring | 1452 | 0.979 | 0.986 | 0.984 | −0.002 | Best class; distinctive radial geometry |
| Local | 539 | 0.737 | 0.813 | 0.834 | +0.021 | Still the weakest well-supported class |
| Random | 130 | 0.862 | 0.891 | 0.902 | +0.010 | |
| Scratch | 179 | 0.695 | 0.851 | 0.861 | +0.010 | Case Study 3 rests on this class |
| Near-full | 22 | 0.917 | 0.978 | 0.978 | +0.000 | Only 22 val samples; indicative, not measured |
| None | 5529 | 0.960 | 0.980 | 0.983 | +0.003 | |
| **MACRO-F1** | | **0.8576** | **0.9157** | **0.9232** | **+0.0075** | |

Read the per-class deltas against the sample size, not in isolation. Near-full has 22
validation wafers, so **one wafer moves its F1 by ~0.022 and the macro average by ~0.0026** —
larger than most of the TTA deltas in this table. The column is worth showing, but only
Edge-Loc and Local move by more than single-wafer noise.


Every class improved. Same architecture, same 615,801 parameters, same data, same split.

### What actually moved the number

Not the architecture. Two changes to the training recipe:

1. **Removed the imbalance double-correction.** `train.py` applied inverse-frequency
   weighting *twice* — once as a `WeightedRandomSampler` oversampling rare classes, and
   again as `weight=` on `CrossEntropyLoss`. Compounded, this is what produced the epoch-5
   collapse documented below. v2 uses **sqrt** inverse-frequency weights on the loss only,
   with plain shuffling.
2. **CosineAnnealingLR** instead of `ReduceLROnPlateau`.

The two weakest classes gained the most, which is the signature of an imbalance fix rather
than a capacity fix: **Scratch +0.156** (0.695 → 0.851) and **Local +0.076** (0.737 → 0.813).
Scratch is the class Case Study 3's negative-evidence beat depends on, so this is the gain
that mattered most.

**TTA-8 at inference** adds a further +0.0075 macro-F1 for free — no retraining, 8× inference
on a 0.6 M-param model, still milliseconds. Wafer defect patterns are dihedral-symmetric
(a rotated Scratch is still a Scratch), so the same 8 transforms used in training augmentation
are averaged at prediction time. Positive on 7 of 9 classes; Edge-Ring moves −0.002, which is
noise at that support.

### Negative result: the ViT is worse

A compact ViT-Tiny (`WaferViT` in `model.py`, patch 8, embed 192, depth 4) was trained on the
same split and **abandoned**:

| | WaferCNN v1 | WaferViT | delta |
|---|---|---|---|
| macro-F1 | 0.8576 | 0.6981 | **−0.160** |
| accuracy | 0.9263 | 0.8722 | −0.054 |
| params | 615,801 | 1,806,537 | 2.9× larger |

Worse on every single class, and it **never predicts `Local` even once** across all 9,357
validation maps — 539 real Local wafers, zero predicted, F1 0.000. Scratch halved to 0.368.

Two things worth recording:

- `holdout_results_vit.json` reported **0.7248**, which does not reproduce; independent
  evaluation gives **0.6981**. Macro-F1 over only the 8 classes the model ever predicts gives
  0.7854. A class the model has silently abandoned must score 0, not drop out of the average —
  all reporting now passes `labels=range(9)` explicitly.
- This matches the literature on fab data: graph attention beat a plain MLP by only +0.012 R²
  on real Intel Foundry deposition data. The headroom on this problem is in calibration and
  imbalance handling, not in the backbone. The +0.058 from a recipe fix against −0.160 from a
  3× larger architecture is the same lesson measured locally.

### Why the first attempt was misleading

Local training was stopped at epoch 5 with macro-F1 **0.6550**, and the headline number hid
a broken model:

| class | epoch 5 | 40 epochs | change |
|---|---|---|---|
| Scratch | 0.075 (precision **0.039**) | 0.695 (precision 0.572) | **+0.620** |
| None | 0.322 (recall **0.192**) | 0.960 (recall 0.933) | **+0.638** |
| accuracy | 0.4614 | 0.9263 | +0.4649 |

At epoch 5 the inverse-frequency class weights and `WeightedRandomSampler` were
over-correcting: the model called almost everything a rare class, so Scratch recall was 0.961
while precision was 0.039 — wrong 96% of the time it said "Scratch". Accuracy of 0.4614 was
*below* the 0.591 you get by predicting "None" every time.

`val_loss` was still falling steadily at that point (1.03 → 0.85 → 0.69 → 0.62 → 0.53), which
is what flagged it as undertrained rather than converged. Training to 40 epochs resolved it.
Worth recording because a macro-F1 of 0.6550 looks respectable in isolation and was not.

**Literature context (for comparison only — do NOT present these as your numbers):**
Comparable CNN baselines on WM-811K report roughly 92–98% macro accuracy
(arXiv 2411.11029, ScienceDirect dual-head CNN). Your macro-F1 on your split
is the only number that goes in the demo.

---

## Known Weak Classes — measured

- **Local (F1 0.813).** Now the weakest well-supported class. "Local" is a catch-all for
  clustered defects that do not fit a named geometry, so its boundary with Edge-Loc is
  genuinely fuzzy — some of this ceiling is in the labels, not the model.
- **Scratch (F1 0.851, up from 0.695).** No longer the weakest class, but **Case Study 3 is
  the Scratch beat**, so it stays on this list. A thin linear trail still survives the 64×64
  resize poorly. It classifies the case-study map correctly at high confidence; do not
  extrapolate that to general reliability on thin patterns.
- **Near-full (F1 0.978).** Looks excellent, but there are only **22** validation samples.
  A single misclassification moves F1 by ~0.02. Treat as indicative, not measured.
- **Donut (F1 0.905).** 83 validation samples — same caveat, less severely.

---

## Self-Test Results

All six case-study patterns classify correctly through the MCP server's real map paths:

```
L-4471: expect Edge-Ring  got Edge-Ring  conf 0.978
L-4402: expect Center     got Center     conf 0.948
L-5502: expect Near-full  got Near-full  conf 1.000
L-3310: expect Scratch    got Scratch    conf 0.987
L-4815: expect Donut      got Donut      conf 1.000
L-5120: expect Random     got Random     conf 0.933
```

Full per-class metrics are regenerated into `holdout_results.json`.

---

## Honest Limitations

- Wafer maps and SECOM sensor data are from entirely separate, unrelated
  datasets — any case study fusing both is a constructed pairing for demo
  purposes (see docs/problem-statement.md / Known Limitations).
- Macro-F1 is measured on a 15% held-out validation split. No cross-validation was run
  (time constraint); treat it as an estimate with ~±2pp uncertainty, more for Near-full
  (22 samples) and Donut (83).
- **The reported split is also the model-selection split.** The checkpoint is chosen as the
  epoch with the best validation macro-F1, so 0.9157 is mildly optimistic as an estimate of
  unseen-data performance. The v1→v2 comparison is still fair — both were selected the same
  way on the same split — but a clean three-way train/val/test split is the honest fix and
  has not been done.
- **Loading the dataset needed two shims.** `LSWMD.pkl` was written under Python 2 with a
  pre-0.20 pandas, so it fails on a modern interpreter twice: `pandas.indexes` was renamed
  to `pandas.core.indexes`, and the byte stream is not ASCII-decodable. Both are properties
  of the published dataset; see `data_prep.py`.
- The `None` class represents "no defect detected" rather than a distinct
  pattern — the model learns this label, but in a real fab pipeline, "None"
  maps would typically be filtered before root-cause analysis.
