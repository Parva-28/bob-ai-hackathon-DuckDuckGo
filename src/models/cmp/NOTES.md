# NOTES.md — Track A: PHM 2016 CMP, conformal intervals

**Directory:** `src/models/cmp/`
**Purpose:** replace the fabricated SECOM↔WM-811K lot pairings with a dataset where the
process sensors and the outcome are measured on the **same wafers**.

---

## Why this dataset

SECOM and WM-811K are unrelated. Every "lot" joining them is constructed, and everything
downstream inherits that. PHM 2016 CMP removes the problem at the root: the challenge is to
predict per-wafer material removal rate from the polishing traces of that same wafer. The
causal link is measured, not asserted.

Chaired by **Seagate** and **Siemens Corporate Technology**. Scoring rule was MSE 90% +
**physics-based modelling approach 10%** — a benchmark that reserves marks for
interpretability.

The features are the mechanism our batch-risk story already claims: consumable wear counters
(`USAGE_OF_BACKING_FILM`, `USAGE_OF_DRESSER`, `USAGE_OF_POLISHING_TABLE`,
`USAGE_OF_DRESSER_TABLE`, `USAGE_OF_MEMBRANE`, `USAGE_OF_PRESSURIZED_SHEET`), five
pressures, three slurry flow lines, three rotation rates.

**Source.** The PHM Society download link 404s. `data_prep.py` pulls the archived copies
(Wayback, 2018-04-13 snapshots) — 9.0 MB training, 1.7 MB validation. Public data, no
credentials.

---

## Data decisions, all of which change the numbers

**The competition's val and test labels are masked as `?`.** They were the blind sets and
the ground truth was never released. So we **cannot score against the PHM leaderboard**, and
nothing here should be compared to published competition results. All figures below come
from our own split of the 2,006 labelled training runs.

**Four outliers removed.** Four runs report a removal rate above 4,100 where the next
highest is 162.6 — measurement errors. Published work on this dataset removes the same four.

**Split is grouped by `WAFER_ID`.** 2,006 runs come from 1,699 wafers; 282 wafers were
polished at both stage A and stage B. A row-wise split would put the same wafer on both
sides. 75/25 grouped split, and `GroupKFold` inside the conformal procedure so a wafer
cannot sit in both a fit fold and its calibration fold — otherwise conformity scores are
optimistic and coverage is overstated, which is the one thing this exercise must not do.

**Traces are aggregated per run.** Each raw CSV is a time series for one (wafer, stage).
Process variables get mean/std/min/max **plus a linear slope** — CMP degradation is a trend
within the polish, and a mean destroys it. Usage counters are constant within a run (they
describe tool state going in), so they are taken as-is. 73 features.

---

## Point model

`HistGradientBoostingRegressor`, 400 iterations, lr 0.06, on 1,503 train / 503 test runs.

| metric | test |
|---|---|
| R² | **0.9403** |
| RMSE | 7.51 |
| MAE | 3.80 |
| **max error** | **75.37** |
| MSE (PHM scoring metric) | 56.4 |

**Read the max error, not just R².** A single bad prediction feeding a run-to-run controller
is the failure mode; 75.37 against a target mean of 90 means one run was predicted almost
80% wrong. The mean hides it entirely. This is why §4 of the plan lists max error separately.

**R² 0.94 is higher than the plan's calibration (~0.70 is good on real production data).**
Not a contradiction, but worth saying why rather than claiming a win: the plan's benchmark
was Samsung Austin CVD virtual metrology, a harder target. CMP removal rate here is measured
on the same tool over a contiguous period, so train and test are closer in distribution than
a deployed model would face. Do not present 0.94 as evidence our method beats published
virtual-metrology work.

---

## Conformal intervals — the actual deliverable

CV+ via MAPIE `CrossConformalRegressor`, 5 grouped folds.

| α | target | empirical coverage | mean width |
|---|---|---|---|
| 0.05 | 95% | 96.8% | 22.7 |
| 0.10 | 90% | **94.0%** | 17.1 |
| 0.20 | 80% | 86.3% | 12.4 |

Coverage holds at every level, slightly conservative — expected for CV+.

### Conditional coverage degrades near the upper control limit

This is the finding, and it reproduces the Merck/Versum caveat the plan flagged: *marginal
coverage holds while conditional coverage degrades approaching the control limit.*

| stratum | n | α=0.05 | α=0.10 | α=0.20 |
|---|---|---|---|---|
| p0-10 (low tail) | 51 | 100.0% | 96.1% | 92.2% |
| p10-25 | 75 | 100.0% | 98.7% | 90.7% |
| p25-75 (bulk) | 251 | 98.4% | 96.4% | 90.0% |
| **p75-90** | 75 | **88.0%** | **84.0%** | **70.7%** |
| p90-100 (high tail) | 51 | 94.1% | 88.2% | 78.4% |

At α=0.10 the marginal number is 94.0% — comfortably above target. But in the p75-90
stratum it is **84.0%**, below the 90% promised. That band is where runs approach the upper
control limit, which is exactly where the disposition decisions are made. A system reporting
only marginal coverage would claim 94% and be wrong where it matters.

**Say this on stage.** Reporting the stratified table rather than the marginal number is the
difference between a calibration claim and a calibration result.

---

## Point vs interval for excursion detection

An excursion is a run whose **true** removal rate falls outside control limits, set at the
5th/95th percentile of the **training** distribution — [62.1, 153.6]. Using test data to set
limits would leak the thing being detected. 49 excursions in 503 test runs.

A point model flags an excursion only when its own prediction lands outside the limits.
Regression to the mean means it rarely does. The interval flags whenever it **cannot rule
out** an excursion, which is the question an engineer is actually asking.

| method | sensitivity | precision | runs flagged |
|---|---|---|---|
| point prediction | **34.7%** | 54.8% | 31 |
| conformal @ α=0.05 | **95.9%** | 23.0% | 204 |
| conformal @ α=0.10 | **93.9%** | 27.2% | 169 |
| conformal @ α=0.20 | **91.8%** | 30.8% | 146 |

**Same model. 34.7% → 93.9%.** The point model misses roughly two of every three excursions;
the interval catches roughly fourteen of fifteen.

Two honest qualifications:

1. **This is 2.7×, not the 40× Merck/Versum reported** (1.9% → >80%). The direction and the
   mechanism are the same, but our point baseline is far stronger than theirs — R² 0.94 means
   our predictions land near the truth often enough to cross a limit sometimes. Quote our own
   number, not theirs, and cite theirs only as prior art.
2. **Precision falls as sensitivity rises.** At α=0.10 an engineer reviews 169 runs to find
   46 real excursions — 27% precision, so roughly three reviews per find. That is a staffing
   decision, not a free win, and α is the dial. The plan's alarm-rate target (<50 per
   chamber-day against a traditional-FDC baseline of 100–500) is the frame to argue it in.

---

## Serving

`predict.py` exposes `predict_removal_rate(process_features, alpha=0.10)`, registered as
the MCP tool of the same name — the pipeline now reports **9 real tools, 0 stubs**.

It returns the interval as the primary answer and the point estimate as secondary, and it
distinguishes two questions an engineer conflates:

| field | meaning |
|---|---|
| `excursion_likely` | the point estimate is outside the control limits |
| `excursion_possible` | **the interval** crosses a limit — an excursion cannot be ruled out |

The gap between those two is the 34.7% → 93.9% result, made operational. A real example
from the self-check: predicted 148.55 against a UCL of 153.53, so `excursion_likely` is
false — but the interval reaches 156.11, so `excursion_possible` is true. The true value
was 149.13. A point-only system would have passed that run without comment.

It also sets `coverage_caveat` when the prediction lands in the p75-90 band, because that
is where our measured conditional coverage fell to 84.0% against a 90% target. The tool
says where its own guarantee is weak rather than presenting one number everywhere.

When the checkpoint is missing the tool returns `_mode: "unavailable"` with a remedy. It
does **not** fall back to a stub interval — every other tool here has a schema-valid stub,
but an invented range would contradict the only thing this tool claims, which is that its
interval is measured.

## What is not done

- `lots.json` fabrications are **not yet retired**; that is the remaining half of Track A.
- No abstention gate (Track B: RI + GSI).
- No physics-based term, so the 10% interpretability component of the PHM scoring rule is
  unaddressed.
- Stage A and stage B are pooled. They have very different target distributions (A: mean
  111.7, σ 242.3 before outlier removal; B: mean 80.0, σ 9.2). Per-stage models would very
  likely be better and would make the conditional-coverage table cleaner.

---

## Reproduce

```bash
.venv/bin/python src/models/cmp/data_prep.py   # downloads + aggregates, ~2 min
.venv/bin/python src/models/cmp/train.py       # point model + conformal, ~1 min
```

Results land in `cmp_results.json`; the fitted point model in `checkpoints/cmp_model.pkl`.
