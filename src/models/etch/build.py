"""
build.py — fit and evaluate the LAM 9600 etch-tool fault detector.

    python src/models/etch/build.py

Downloads MACHINE_Data.mat from Eigenvector Research if it is not already in
data/ (it is not committed: it is their dataset, fetched from the source), then:

  1. per wafer, the mean and spread of 17 tool variables over each of the two
     main-etch steps (4 and 5): 68 features with physical names;
  2. evaluates the detector with 10 × 5-fold cross-validation over the normal
     wafers, the alarm limit set from out-of-fold scores so it reflects wafers
     the model has not seen; every faulty wafer is scored in every fold;
  3. fits the final detector on all 107 usable normal wafers and writes
     checkpoints/etch_detector.json: the baselines, the limit, the metrics and
     every wafer's feature vector, so scoring at runtime needs no .mat file.

The detector is the largest per-feature deviation, in σ of the normal wafers of
the same experiment. The three experiments ran weeks apart with different means
(the dataset's own notes say so), so each wafer is compared with its own
experiment's normal baseline — as a fab recalibrates after maintenance. The
paper's PCA (T² + Q) detector was evaluated the same way and did worse (see
NOTES.md), so the simpler one ships.

Reference: B.M. Wise et al., "A Comparison of Principal Components Analysis,
Multi-way Principal Components Analysis, Trilinear Decomposition and Parallel
Factor Analysis for Fault Detection in a Semiconductor Etch Process",
J. Chemometrics 13, 379–396 (1999).
"""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

import numpy as np
from scipy.io import loadmat
from scipy.stats import beta
from sklearn.model_selection import StratifiedKFold

HERE = Path(__file__).parent
MAT = HERE / "data" / "MACHINE_Data.mat"
URL = "https://eigenvector.com/data/Etch/MACHINE_Data.mat"
OUT = HERE / "checkpoints" / "etch_detector.json"

STEPS = (4, 5)
# Time and Step Number are bookkeeping; the two reflected powers sit at 0 on
# almost every row, so their σ is noise and any blip would read as a fault.
DROP = {"Time", "Step Number", "RF Btm Rfl Pwr", "TCP Rfl Pwr"}
ALARM_Q = 0.99          # alarm limit: 99th percentile of out-of-fold normal scores
SCORE_AT_LIMIT = 0.6    # the limit maps here: the UI's "high" boundary


def load() -> tuple[list[str], list[dict]]:
    if not MAT.exists():
        MAT.parent.mkdir(parents=True, exist_ok=True)
        print(f"downloading {URL}")
        urllib.request.urlretrieve(URL, MAT)
    L = loadmat(MAT, squeeze_me=True, struct_as_record=False)["LAMDATA"]
    names = [v.strip() for v in L.variables]
    keep = [i for i, v in enumerate(names) if v not in DROP]
    step_col = names.index("Step Number")

    def wafer(X, wid, fault):
        if X.ndim != 2 or not all((X[:, step_col] == s).sum() >= 3 for s in STEPS):
            return None     # l3125 has 3 rows in all: it never reaches both etch steps
        f = []
        for s in STEPS:
            S = X[X[:, step_col] == s][:, keep]
            f += [S.mean(0), S.std(0)]
        return {"id": wid, "experiment": wid[1:3], "fault": fault,
                "x": np.concatenate(f)}

    rows = [wafer(X, n.strip(), None) for X, n in zip(L.calibration, L.calib_names)]
    rows += [wafer(X, n.strip(), f.strip()) for X, n, f in zip(L.test, L.test_names, L.fault_names)]
    var = [names[i] for i in keep]
    feats = [f"{v} | step {s} {stat}" for s in STEPS for stat in ("mean", "spread") for v in var]
    return feats, [r for r in rows if r]


class Detector:
    def fit(self, X: np.ndarray, exp: np.ndarray) -> "Detector":
        self.mu = {e: X[exp == e].mean(0) for e in np.unique(exp)}
        Z = X - np.array([self.mu[e] for e in exp])
        self.sd = Z.std(0, ddof=1) + 1e-9
        return self

    def z(self, X: np.ndarray, exp: np.ndarray) -> np.ndarray:
        return (X - np.array([self.mu[e] for e in exp])) / self.sd

    def stat(self, X, exp):
        return np.abs(self.z(X, exp)).max(1)


def oof_limit(X, exp, seed=0):
    s = np.zeros(len(X))
    for a, b in StratifiedKFold(4, shuffle=True, random_state=seed).split(X, exp):
        s[b] = Detector().fit(X[a], exp[a]).stat(X[b], exp[b])
    return float(np.quantile(s, ALARM_Q)), s


def clopper_pearson(k, n, a=0.05):
    lo = 0.0 if k == 0 else beta.ppf(a / 2, k, n - k + 1)
    hi = 1.0 if k == n else beta.ppf(1 - a / 2, k + 1, n - k)
    return round(float(lo), 3), round(float(hi), 3)


def main():
    feats, rows = load()
    normal = [r for r in rows if r["fault"] is None]
    faulty = [r for r in rows if r["fault"]]
    Xn = np.array([r["x"] for r in normal]); en = np.array([r["experiment"] for r in normal])
    Xf = np.array([r["x"] for r in faulty]); ef = np.array([r["experiment"] for r in faulty])

    # ---- evaluation ----
    reps, fa_hits, fa_n, det = 10, 0, 0, np.zeros(len(faulty))
    for rep in range(reps):
        for tr, te in StratifiedKFold(5, shuffle=True, random_state=rep).split(Xn, en):
            d = Detector().fit(Xn[tr], en[tr])
            lim, _ = oof_limit(Xn[tr], en[tr])
            fa_hits += int((d.stat(Xn[te], en[te]) > lim).sum()); fa_n += len(te)
            det += d.stat(Xf, ef) > lim
    det /= reps * 5
    caught = int((det >= 0.5).sum())
    metrics = {
        "protocol": "10 x 5-fold CV over normal wafers (stratified by experiment); alarm limit = "
                    "99th percentile of out-of-fold normal scores; every faulty wafer scored in every fold",
        "normal_wafers": len(normal), "faulty_wafers": len(faulty),
        "false_alarm_rate": round(fa_hits / fa_n, 4),
        "false_alarm_ci95": clopper_pearson(fa_hits, fa_n),
        "faults_detected": f"{caught}/{len(faulty)}",
        "fault_detection_ci95": clopper_pearson(caught, len(faulty)),
        "per_fault_detection_rate": {f"{r['id']} {r['fault']}": round(float(p), 2) for r, p in zip(faulty, det)},
        "comparison": "PCA T²+Q (Wise et al. 1999), same CV and out-of-fold limits: 19-20/21 at "
                      "0.9-1.5% false alarms; this detector without the spread features: 20/21 "
                      "(misses He Chuck). See NOTES.md.",
    }

    # ---- final model ----
    d = Detector().fit(Xn, en)
    lim, oof = oof_limit(Xn, en)
    floor = float(np.median(oof))
    artifact = {
        "model": "LAM 9600 etch fault detector: max |z| over 68 per-step features, per-experiment baseline",
        "source": "Eigenvector Research, Metal Etch Data for Fault Detection Evaluation (MACHINE_Data.mat); "
                  "Wise et al., J. Chemometrics 13, 379-396 (1999)",
        "features": feats,
        "baseline_mean": {e: np.round(m, 6).tolist() for e, m in d.mu.items()},
        "baseline_sd": np.round(d.sd, 6).tolist(),
        "alarm_limit_sigma": round(lim, 4),
        "typical_normal_sigma": round(floor, 4),
        "score_mapping": f"anomaly_score = clip({SCORE_AT_LIMIT} * (max|z| - typical) / (limit - typical), 0, 1): "
                         f"0 = a typical normal wafer, {SCORE_AT_LIMIT} = the alarm limit",
        "metrics": metrics,
        "wafers": {r["id"]: {"experiment": r["experiment"], "fault": r["fault"],
                             "x": np.round(r["x"], 6).tolist()} for r in rows},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(artifact, indent=1))
    print(json.dumps({k: v for k, v in metrics.items() if k != "per_fault_detection_rate"}, indent=2))
    print("limit", round(lim, 3), "sigma; typical normal", round(floor, 3), "sigma ->", OUT)


if __name__ == "__main__":
    main()
