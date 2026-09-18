"""
abstain.py — RI and GSI gates: deciding when NOT to answer.

Conformal intervals have measured coverage, but coverage is an average over inputs
that resemble the training set. Hand the model a run unlike anything it has seen
and it still returns a confident-looking interval while the guarantee quietly
stops applying. Our own numbers already show the soft version of this: marginal
coverage 94.0% at alpha=0.10, but 84.0% in the p75-90 band.

Two independent gates, from the NCKU automatic-virtual-metrology lineage:

RI — Reliance Index (output confidence)
    Overlap area between the predictive distributions of two STRUCTURALLY
    DIFFERENT models fit on the same data. Agreement between different model
    families is evidence; agreement within one family is not. RI = 1 means the
    two distributions coincide, RI = 0 means they are disjoint.

    The threshold is derived from a business-defined maximum tolerable error, NOT
    a round number. The widely quoted "RI > 0.7" is a misattribution: the fixed
    0.7 / 0.3 thresholds belong to the Device Health Index in a different NCKU
    patent. Here RI_threshold is the RI value attained when two models differ by
    exactly the tolerable error, which makes it a property of the process spec.

GSI — Global Similarity Index (input novelty)
    Mahalanobis distance from the input to the training distribution. Catches
    "I have never seen an input like this", which RI structurally cannot: two
    models can agree confidently and both be wrong outside their experience.
    Threshold at a multiple of the maximum GSI observed in training.

Abstain if EITHER gate fails. They are different failure modes, so this is an OR,
never an average -- averaging lets a strong RI mask a novel input.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

HERE = Path(__file__).parent
DATA = HERE / "data"

# Tolerable error on removal rate, in target units. CMP removal rate in this
# dataset runs ~53-163 with sigma ~30, and run-to-run control acts on deviations
# of a few units, so 5.0 is a defensible stand-in for a spec an engineer would set.
# It is a PROCESS decision, not a model hyperparameter -- expose it, do not tune it.
TOLERABLE_ERROR = 5.0

# GSI threshold as a multiple of max training GSI. The NCKU work uses 2-3x.
GSI_MULTIPLE = 2.0


@dataclass
class Gate:
    ri: float
    gsi: float
    ri_threshold: float
    gsi_threshold: float
    ri_pass: bool
    gsi_pass: bool
    abstain: bool
    reason: str | None
    novel_variables: list[str]


def _overlap(mu1: float, s1: float, mu2: float, s2: float) -> float:
    """
    Overlap area of two normal densities — the RI definition.

    For equal variances there is a closed form: 2 * Phi(-|mu1-mu2| / (2*sigma)).
    Variances differ here, so use the pooled spread, which is the standard
    approximation and is monotone in the disagreement, which is what a gate needs.
    """
    s = np.sqrt((s1**2 + s2**2) / 2.0)
    if s <= 0:
        return 1.0 if abs(mu1 - mu2) < 1e-9 else 0.0
    return float(2.0 * norm.cdf(-abs(mu1 - mu2) / (2.0 * s)))


class AbstentionGate:
    """Fit on training data, then evaluate any input."""

    def __init__(self, tolerable_error: float = TOLERABLE_ERROR,
                 gsi_multiple: float = GSI_MULTIPLE):
        self.tolerable_error = tolerable_error
        self.gsi_multiple = gsi_multiple
        self.model_a = None          # gradient boosting
        self.model_b = None          # neural net — a DIFFERENT structure, on purpose
        self.scaler = None
        self._mean = None
        self._inv_cov = None
        self.gsi_threshold = None
        self.ri_threshold = None
        self.features: list[str] = []
        self._resid_a = self._resid_b = 0.0

    # ── fitting ──────────────────────────────────────────────────────────────
    def fit(self, X: pd.DataFrame, y: np.ndarray) -> "AbstentionGate":
        from sklearn.ensemble import HistGradientBoostingRegressor
        from sklearn.neural_network import MLPRegressor
        from sklearn.preprocessing import StandardScaler
        from sklearn.pipeline import make_pipeline

        self.features = list(X.columns)

        self.model_a = HistGradientBoostingRegressor(
            max_iter=400, learning_rate=0.06, min_samples_leaf=15,
            l2_regularization=1.0, random_state=42).fit(X, y)
        # A tree ensemble and an MLP fail differently. Two gradient boosters with
        # different seeds would agree by construction and RI would measure nothing.
        self.model_b = make_pipeline(
            StandardScaler(),
            MLPRegressor(hidden_layer_sizes=(128, 64), max_iter=1500,
                         early_stopping=True, random_state=42)).fit(X, y)

        # Per-model spread, from training residuals. RI compares distributions, so
        # each model needs a width as well as a mean.
        self._resid_a = float(np.std(y - self.model_a.predict(X)))
        self._resid_b = float(np.std(y - self.model_b.predict(X)))

        # GSI: Mahalanobis in a whitened, rank-reduced space. 73 features on ~1,500
        # rows makes the raw covariance ill-conditioned, so use PCA to a rank the
        # data actually supports rather than pseudo-inverting a singular matrix.
        from sklearn.decomposition import PCA
        self.scaler = StandardScaler().fit(X)
        Z = self.scaler.transform(X)
        n_comp = min(20, Z.shape[1], Z.shape[0] // 20)
        self._pca = PCA(n_components=n_comp, random_state=42).fit(Z)
        P = self._pca.transform(Z)
        self._mean = P.mean(axis=0)
        cov = np.cov(P, rowvar=False) + np.eye(P.shape[1]) * 1e-6
        self._inv_cov = np.linalg.inv(cov)

        train_gsi = self._gsi_raw(X)
        self.gsi_threshold = float(train_gsi.max() * self.gsi_multiple)

        # RI threshold: the RI two models attain when they disagree by exactly the
        # tolerable error. Derived from the spec, not chosen.
        self.ri_threshold = _overlap(0.0, self._resid_a,
                                     self.tolerable_error, self._resid_b)
        return self

    # ── scoring ──────────────────────────────────────────────────────────────
    def _gsi_raw(self, X: pd.DataFrame) -> np.ndarray:
        P = self._pca.transform(self.scaler.transform(X[self.features]))
        d = P - self._mean
        return np.sqrt(np.einsum("ij,jk,ik->i", d, self._inv_cov, d))

    def _novel_variables(self, X: pd.DataFrame, top: int = 3) -> list[list[str]]:
        """Which raw features are furthest outside their training range. An engineer
        needs 'abstained because DRESSER usage is unlike anything seen', not a refusal."""
        Z = np.abs(self.scaler.transform(X[self.features]))
        idx = np.argsort(-Z, axis=1)[:, :top]
        return [[self.features[j] for j in row if Z[i, j] > 3.0]
                for i, row in enumerate(idx)]

    def evaluate(self, X: pd.DataFrame) -> list[Gate]:
        pa = self.model_a.predict(X[self.features])
        pb = self.model_b.predict(X[self.features])
        gsi = self._gsi_raw(X)
        novel = self._novel_variables(X)

        out = []
        for i in range(len(X)):
            ri = _overlap(float(pa[i]), self._resid_a, float(pb[i]), self._resid_b)
            ri_pass = ri >= self.ri_threshold
            gsi_pass = gsi[i] <= self.gsi_threshold
            reasons = []
            if not ri_pass:
                reasons.append(f"models disagree beyond the tolerable error of "
                               f"{self.tolerable_error:g} (RI {ri:.3f} < {self.ri_threshold:.3f})")
            if not gsi_pass:
                reasons.append(f"input unlike training data (GSI {gsi[i]:.2f} > "
                               f"{self.gsi_threshold:.2f})")
            out.append(Gate(
                ri=round(float(ri), 4), gsi=round(float(gsi[i]), 3),
                ri_threshold=round(float(self.ri_threshold), 4),
                gsi_threshold=round(float(self.gsi_threshold), 3),
                ri_pass=bool(ri_pass), gsi_pass=bool(gsi_pass),
                abstain=not (ri_pass and gsi_pass),
                reason="; ".join(reasons) or None,
                novel_variables=novel[i] if not gsi_pass else []))
        return out


def gate_to_dict(g: Gate) -> dict:
    return asdict(g)
