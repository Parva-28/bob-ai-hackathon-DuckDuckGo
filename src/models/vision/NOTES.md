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

**Validation macro-F1:** `___` ← fill this in; do NOT copy from a paper

| Class      | Val F1 | Note |
|------------|--------|------|
| Center     | ___    |      |
| Donut      | ___    | Rare class — watch for low F1 |
| Edge-Loc   | ___    |      |
| Edge-Ring  | ___    |      |
| Local      | ___    |      |
| Random     | ___    |      |
| Scratch    | ___    |      |
| Near-full  | ___    | Rare class — watch for low F1 |
| None       | ___    |      |

**Literature context (for comparison only — do NOT present these as your numbers):**
Comparable CNN baselines on WM-811K report roughly 92–98% macro accuracy
(arXiv 2411.11029, ScienceDirect dual-head CNN). Your macro-F1 on your split
is the only number that goes in the demo.

---

## Known Weak Classes

*Fill in after training:*

- **Donut:** Very few training samples (~150–200); expect lower F1 even with
  class weighting. If F1 < 0.70, document it — don't hide it.
- **Near-full:** Similar scarcity; model may confuse with Edge-Ring in
  borderline geometries.
- **Scratch:** Linear geometry is distinctive but thin — if the map resolution
  after resize loses the scratch, accuracy will suffer. Inspect a few predictions.

---

## Self-Test Results

Run `python src/models/vision/test_classifier.py` and paste the output here:

```
(paste output of test_classifier.py here)
```

---

## Honest Limitations

- Wafer maps and SECOM sensor data are from entirely separate, unrelated
  datasets — any case study fusing both is a constructed pairing for demo
  purposes (see PRD Section 9 / Known Limitations).
- Macro-F1 is measured on a 15% held-out validation split. No cross-validation
  was run (time constraint); treat the number as an estimate with ~±2pp
  uncertainty due to the small size of rare classes.
- The `None` class represents "no defect detected" rather than a distinct
  pattern — the model learns this label, but in a real fab pipeline, "None"
  maps would typically be filtered before root-cause analysis.
