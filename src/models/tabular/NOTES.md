# NOTES.md — Track 2: Sensor Anomaly Detection & Batch Risk Flagging

**Owner:** Teammate B (Track 2)
**Directory:** `src/models/tabular/`
**Status:** Implementation complete; fill in measured metrics after training

---

## Dataset

- **Source:** SECOM Manufacturing Dataset (UCI ML Repository, ID 179)
- **Size:** 1,567 observations × 590 sensor features
- **Labels:** 104 fails (class −1), 1,463 passes (class +1)
- **Imbalance:** ~1:14 fail:pass ratio (~6.6% fail rate)
- **Missing values:** ~4.5% of values missing, spread across ~28 sensors;
  some sensors have >80% missing values and are dropped entirely

---

## Preprocessing

### Missing value handling

**Method: Median imputation per feature, fit on training data only.**

Rationale:
- Mean imputation is sensitive to sensor outliers (common in fab sensor data)
- KNN imputation would be more accurate but is slow on 590 features; median
  is a defensible baseline for a hackathon timeline
- Sensors with >80% missing values are dropped before imputation — these
  columns contain no recoverable signal and would be pure noise if imputed
- **Rows are NOT dropped.** SECOM's fail class has only 104 rows. Dropping
  any row with a NaN would discard up to ~70% of all rows and most fail cases,
  which completely defeats the exercise

### Feature scaling

StandardScaler (zero mean, unit variance), fit on training rows only, applied
to both train and validation. The fail-class centroid is computed in scaled space.

### Split

- 80% train / 20% validation, stratified by label (ensures fails appear in both)
- Random seed: 42

---

## Model

**Algorithm: Isolation Forest**

- Trained on **pass-class rows only** (unsupervised normality model)
- Contamination parameter set to the true observed fail rate (~0.067)
- 200 estimators, `max_samples="auto"`
- Anomaly score: `1.0 − normalised(decision_function)` → higher = more anomalous

Rationale for Isolation Forest over autoencoder:
- IF is well-calibrated for tabular data with many irrelevant features (it
  randomly subsamples features per tree, which naturally handles high
  dimensionality)
- No architecture decisions to tune; faster to train on CPU
- Published SECOM results with IF are competitive with deep baselines at this
  sample size (1,567 rows)

---

## Results (fill in after running train.py)

**⚠️ Do NOT report accuracy — it is ~93% for "predict all pass" and meaningless.**
**Report recall and precision on the fail class only.**

| Metric | Value | Note |
|--------|-------|------|
| Val recall (fail class) | `___` | Fill in after training |
| Val precision (fail class) | `___` | Fill in after training |
| Val F1 (fail class) | `___` | Fill in after training |
| Anomaly threshold used | `___` | Saved in checkpoints/model_meta.json |
| Baseline recall (predict all pass) | 0.0% | Any improvement is meaningful |

**Literature context (do NOT present these as your numbers):**
The [Medium walkthrough](https://medium.com/@amy2598877/from-14-to-85-recall-how-i-got-ai-to-finally-catch-faulty-products-using-public-secom-data-04f64a804968)
reports pushing SECOM recall from 14% to 85% with heavy class-weight tuning
on a supervised model. An unsupervised IF baseline typically reaches 55–70%
recall at 20–35% precision. Your measured numbers are what go in the demo.

---

## flag_at_risk_batch — Documented Limitation

`flag_at_risk_batch` computes **cosine similarity** between the incoming lot's
planned parameters and the **mean sensor vector of fail-class training rows**.

This is explicitly a similarity proxy, not a causal prediction.

**Limitations to state clearly in the demo and README:**
1. SECOM does not contain "upcoming lot" data — we use SECOM fail-class rows
   as a stand-in for "historically low-yield parameter profiles"
2. SECOM and WM-811K are entirely separate, unrelated datasets — any case study
   that fuses wafer map + sensor data is a constructed pairing (PRD Section 9)
3. A high similarity score means "these parameters resemble past fails" — it
   does NOT mean this lot will fail; it is a triage signal for engineer review
4. The 0.60 similarity threshold is a starting point; in production it would
   be tuned against a real held-out set of future lots

---

## Self-Test Results

Run `python src/models/tabular/test_anomaly.py` and paste the output here:

```
(paste output of test_anomaly.py here)
```

---

## Known Weak Scenarios

- **Low-signal fails:** SECOM contains fail lots with very subtle sensor deviations
  (indistinguishable from measurement noise) — these will be missed by any
  unsupervised model. Report the miss rate honestly.
- **Sensor coverage mismatch:** The eval fixtures use a small subset of sensor names
  (e.g. `sensor_12`, `sensor_45`). The model fills unknown sensors with training
  medians — this is correct but means fixture-based scores reflect primarily the
  few named sensors, not the full 590-feature distribution.
- **Constructed pairings:** All case study sensor signatures are constructed values,
  not real SECOM rows. The test validates the pipeline mechanics, not real-world
  accuracy on those specific patterns.
