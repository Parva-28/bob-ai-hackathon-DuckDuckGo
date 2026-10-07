# NOTES.md — PHM 2018 ion-mill etch: negative result, not shipped

**Directory:** `src/models/ionmill/` · **Status:** evaluated and rejected; nothing here is
wired into the app or the MCP server.

## What was tried

The 2018 PHM Data Challenge ion-mill etch data (NASA DASHlink resource 1009): 4-second
sensor streams from 5 ion-mill tools (`*_DC_score.csv`, 2.4 GB) with row-aligned
time-to-failure labels for three Flowcool fault modes (`*_DC_groundtruth.csv`). The data
is not committed; `data/` is gitignored.

`prepare.py` turns the streams into 58,486 ten-minute windows: per-sensor mean, spread,
min and max for 16 sensors (ROTATIONSPEED is constant and dropped), plus 1 h / 6 h means,
slopes and minima of Flowcool pressure and flow rate, and the time to the next failure.

Labelled failures: 01_M02 18, 02_M02 21, 03_M01 12, 06_M01 1, 04_M01 none (52 in total).

Target: "a Flowcool fault within the next H hours", with censored tails dropped.
Model: HistGradientBoosting, class-balanced. Baseline: low Flowcool pressure over 6 h.

## Results

ROC-AUC on the held-out tool. Prevalence is the base rate, so PR-AUC near prevalence
means no skill.

| Protocol | Horizon | 01_M02 | 02_M02 | 03_M01 | 06_M01 |
|---|---|---|---|---|---|
| Leave-one-tool-out, raw features | 1 h | 0.76 | 0.80 | 0.49 | 0.65 |
| | 6 h | 0.39 | 0.60 | 0.27 | 0.22 |
| | 24 h | 0.78 | 0.35 | 0.37 | 0.45 |
| | 72 h | 0.41 | 0.33 | 0.39 | 0.61 |
| Leave-one-tool-out, per-tool baseline | 24 h | 0.46 | 0.58 | 0.35 | 0.32 |
| | 72 h | 0.47 | 0.42 | 0.35 | 0.56 |

At 1 h the positive windows number in the single digits per tool (prevalence ≤ 0.004),
so those ROC values are noise; PR-AUC there is ≤ 0.03.

Same-tool future split (train on each tool's first 60% of time, test on the last 40%):
only 03_M01 has failures in its test period, ROC 0.68 at 24 h. One tool is not evidence.

## Why it fails

1. **The data stops before most failures.** Tools sit idle for a day or more before a
   failure: e.g. 02_M02 has TTF 66,812 s, then no sensor rows for 67,126 s, and the
   failure lands inside the gap. Short-horizon prediction has almost no pre-failure data.
2. **This release is the challenge's scoring portion only.** The training set the
   competitors used is not published here, which leaves 4 labelled tools and 52
   failures to learn cross-tool behaviour from.

## Decision

Not shipped. An unvalidated failure forecast in the demo would be exactly the kind of
claim this project refuses to make. The LAM 9600 detector (`../etch/`) carries the
etch-tool story instead.
