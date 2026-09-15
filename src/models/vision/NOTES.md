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
| Architecture    | WaferCNN (ResNet-style, ~340 K params) |
| Epochs          | 40                            |
| Batch size      | 128                           |
| Optimiser       | Adam, lr=1e-3, weight_decay=1e-4 |
| LR schedule     | ReduceLROnPlateau (×0.5 on val F1 plateau, patience=5) |
| Loss            | CrossEntropyLoss with inverse-frequency class weights |
| Sampler         | WeightedRandomSampler (oversamples rare classes) |
| Augmentation    | Random h-flip, v-flip, 90° rotation (train only) |
| Device          | CUDA if available, else CPU    |

---

## Results (fill in after running train.py)

**Validation macro-F1: 0.8576** — measured on our own held-out split, 9,357 maps.
**Accuracy: 0.9263** (quoted only for context; "None" is 59% of the split, so the
trivial "predict None always" baseline already scores 0.591 — macro-F1 is the number
that means anything here.)

| Class      | Support | Prec  | Recall | Val F1 | Note |
|------------|---------|-------|--------|--------|------|
| Center     |     644 | 0.885 | 0.967  | 0.924  |      |
| Donut      |      83 | 0.705 | 0.952  | 0.810  | Rare class — precision limited by scarcity |
| Edge-Loc   |     779 | 0.791 | 0.882  | 0.834  |      |
| Edge-Ring  |    1452 | 0.989 | 0.968  | 0.979  | Best class — large support, distinctive geometry |
| Local      |     539 | 0.705 | 0.772  | 0.737  | Weakest of the common classes |
| Random     |     130 | 0.815 | 0.915  | 0.862  |      |
| Scratch    |     179 | 0.572 | 0.883  | 0.695  | See note below — this class has a history |
| Near-full  |      22 | 0.846 | 1.000  | 0.917  | Only 22 validation samples; treat with caution |
| None       |    5529 | 0.989 | 0.933  | 0.960  |      |

**Training:** 40 epochs on a Colab T4 (`src/models/vision/colab/train_wafer_cnn.ipynb`), identical
hyperparameters to `train.py`. Local CPU training is ~3.2 min/epoch, so the full run is
over two hours on a laptop; on a T4 it is minutes.

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

- **Scratch (F1 0.695, precision 0.572).** The weakest real class. A thin linear trail
  survives the 64×64 resize poorly, and recall 0.883 against precision 0.572 means it still
  over-predicts Scratch. This matters: **Case Study 3 is the Scratch beat**, so the
  negative-evidence demo rests on the least reliable class. It classifies the case-study map
  correctly at 0.987 confidence, but do not claim general reliability on this class.
- **Local (F1 0.737).** Lowest of the well-supported classes; "Local" is a catch-all for
  clustered defects that do not fit a named geometry, so the boundary with Edge-Loc is
  genuinely fuzzy.
- **Near-full (F1 0.917).** Looks strong, but there are only **22** validation samples.
  A single misclassification moves F1 by ~0.02. Treat as indicative, not measured.
- **Donut (F1 0.810).** 83 validation samples — same caveat, less severely.

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
- **Loading the dataset needed two shims.** `LSWMD.pkl` was written under Python 2 with a
  pre-0.20 pandas, so it fails on a modern interpreter twice: `pandas.indexes` was renamed
  to `pandas.core.indexes`, and the byte stream is not ASCII-decodable. Both are properties
  of the published dataset; see `data_prep.py`.
- The `None` class represents "no defect detected" rather than a distinct
  pattern — the model learns this label, but in a real fab pipeline, "None"
  maps would typically be filtered before root-cause analysis.
