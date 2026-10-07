# NOTES.md — LAM 9600 etch-tool fault detector

**Directory:** `src/models/etch/`
**Rebuild:** `python src/models/etch/build.py` (downloads `MACHINE_Data.mat` on first run)
**Artifact:** `checkpoints/etch_detector.json` (baselines, alarm limit, metrics, per-wafer features)

## Why it exists

The SECOM detector cannot carry the ETCH-07 story. SECOM's sensors are anonymous,
its Isolation Forest barely separates failing from passing lots (ROC-AUC 0.58, see
`../tabular/NOTES.md`), and a lot's 2–3 named sensors are overlaid on a 582-feature
vector they hardly move: every SECOM-scored lot sits at 0.13–0.17. This detector
scores a real etch-tool record, with its sensors named as the tool names them.

## Data

Eigenvector Research, *Metal Etch Data for Fault Detection Evaluation*
(<https://eigenvector.com/data/Etch>): engineering variables from a LAM 9600 metal
etcher over 129 wafers in 3 experiments run weeks apart. 108 normal wafers, 21 with
intentionally induced faults (TCP power, RF power, pressure, BCl3 / Cl2 flow, He
chuck). Reference: Wise et al., *J. Chemometrics* 13, 379–396 (1999).

- One normal wafer (`l3125`) has 3 rows in total and never reaches both etch steps;
  it is excluded, leaving **107 normal wafers**. One fault wafer (`l3122`, RF +8) has
  only 3 rows in step 4; it is kept.
- The `.mat` file is not committed (it is Eigenvector's; `build.py` fetches it).
  The artifact holds derived per-wafer features only.

## Features

Per wafer, for each main-etch step (4 and 5), the mean and spread of 17 variables:
**68 features**. Dropped: Time, Step Number, and the two reflected powers, which sit
at 0 on almost every row so their σ is noise.

The experiments have different means (the dataset's own notes say so). Each wafer is
compared with the normal wafers of **its own experiment**, as a fab recalibrates its
baseline after maintenance. The spread (σ) is pooled across experiments.

## Detector

`max |z|` over the 68 features: the single most deviant feature, in σ of the normal
wafers. Alarm limit: the 99th percentile of **out-of-fold** normal scores, so it
reflects wafers the model has not seen. Limit = **5.44σ**; a typical normal wafer's
peak is 2.89σ.

`anomaly_score = clip(0.6 × (peak − 2.89) / (5.44 − 2.89), 0, 1)`: 0 is a typical
normal wafer, **0.6 is the alarm limit** (the UI's "high" boundary), 1 is far beyond.

`top_deviating_sensors` lists tool variables beyond 4σ. A normal wafer's single most
deviant feature is ~2.9σ by construction (the max of 68), so 3σ would list noise.

## Results — 10 × 5-fold CV over the normal wafers

| Detector (same CV, out-of-fold limits) | Faults detected | False alarms on unseen normals |
|---|---|---|
| **max \|z\|, step mean + spread (shipped)** | **21/21** (95% CI 0.84–1.00) | **1.3%** (95% CI 0.7–2.2%) |
| max \|z\|, step mean only | 20/21 (misses He Chuck) | 1.6% |
| PCA T² + Q (the paper's method), best of 4 settings | 19–20/21 | 0.9–1.5% |

A first PCA run set its limits from training residuals and false-alarmed on 38–100%
of unseen normal wafers: with ~86 training wafers and 34–68 features, PCA's residual
space fits training noise. With out-of-fold limits it is honest, and still loses to
the simpler detector, so the simpler one ships.

Faults detected in fewer than all folds: RF −12 (l2916) and TCP +10 (l2936) at 84%,
Cl2 +5 at 94%, Cl2 −5 at 96%, RF −12 (l3320) at 94%. These are the smallest setpoint
changes.

**Caveat:** 21 faulty wafers. The detection interval's lower bound, 0.84, is the honest
statement; "100%" is not.

## How it is used

`score_sensor_anomaly` (MCP server) routes a lot to this detector when its case
fixture carries an `etch_trace`; every other lot keeps the SECOM path unchanged.

| Case | Lot | Real trace | Induced fault | Score | Top sensors |
|---|---|---|---|---|---|
| case_2a (RF after PM) | L-4471 | l2917 | RF +10 | 1.00 (alarm) | Pressure, RF Load |
| case_2b (clogged edge nozzle) | (planned L-4511) | l3319 | Cl2 −10 | 1.00 (alarm) | Pressure, Vat Valve, TCP Load, BCl3 Flow |

case_2c (chamber seasoning) and case_5a (HEPA filter) have no physically matching
LAM fault, so they are not paired.

**Note for the pitch:** the RF +10 fault shows up mainly as pressure instability and
RF load change, not in the RF power reading. A fault on one setpoint shows up through
the variables that react to it. That is the tool's real behaviour; do not describe it
as "the RF power sensor spiked".

**Provenance:** the traces are real. Pairing a LAM trace with a WM-811K wafer map and
a SECOM signature in one case is constructed, as every cross-dataset case here is.
