# YieldGuard v2 — final round plan

Written 2026-09-18. Grounded in three verified research passes; every load-bearing number below
traces to a source listed in §9.

---

## 0. The honest position

**You have two days, and you asked for the three-week plan.** Both are here, separated. What follows
is the full architecture; §7 marks exactly which slice fits in 48 hours. A judge respects *"here is
the rigorous design, here is the slice we built, here is what we deliberately deferred"* far more
than a broad thin rebuild that breaks on stage.

What is genuinely sound today and stays: the MCP tool layer, Bob orchestration, the eval harness,
the contract discipline, the evidence-citation enforcement. Roughly 1,600 lines of the MCP server
and eval code is product-grade.

What is makeshift, in order of how badly it hurts:

1. **Fabricated sensor↔defect pairings.** SECOM and WM-811K are unrelated datasets. Every "lot" is a
   constructed join. Everything downstream inherits this.
2. **Detection barely beats chance.** ROC-AUC 0.583. Cosine-to-a-centroid is not a method.
3. **Keyword heuristics standing in for reasoning** — category re-derivation and confidence caps
   both pattern-match on strings.
4. **A throwaway UI** — one HTML file on `http.server`.

---

## 1. The thesis change

Three findings from the research, taken together, say the product we described is aimed at the
wrong gap.

**Finding 1 — the industry has formally named its blocker, and it is not accuracy.**
The IRDS Virtual Metrology white paper (NIST-hosted, authors from NIST, CEA-LETI, Tokyo Electron and
Michigan) surveys APC practitioners and states plainly:

> *"Currently, there is no standard or generally accepted method to validate or adopt VM models, or
> to communicate model confidence."*

Their ranked adoption blockers are **confidence in models, data quality, missing process-knowledge
correlation, model maintenance, cost, IP security**. Accuracy is not on the list. They explicitly
ask for a *model quality metric*.

**Finding 2 — a point prediction is nearly useless for excursion detection; an interval is not.**
Merck/Versum, five years of high-volume manufacturing data, ~1,200 batches, including a real
supplier-site distribution shift affecting ~30% of batches. Detecting out-of-control batches:

| Method | Sensitivity |
|---|---|
| Point prediction | **1.9%** |
| Conformal prediction @ α=0.1 | **>80%** |

A **40-fold** difference, from the same underlying model. And their critical caveat is the part
everyone misses: **marginal coverage holds while conditional coverage degrades approaching the
control limit** — precisely where at-risk lots live.

**Finding 3 — explanations make over-acceptance worse, not better.**
Bansal et al. (CHI 2021): explanations raised the rate at which humans accepted AI recommendations
**regardless of whether they were correct**, and did not improve team performance. Buçinca et al.:
explanations **do not reduce over-reliance and may increase it**; only *cognitive forcing functions*
did. CHI 2026's review: showing calibrated uncertainty **alone is inadequate**.

### So the product is not "AI finds root causes." It is:

> **A yield analysis system that knows when not to answer — and is evaluated on that.**

Calibrated intervals, explicit abstention, a measured abstention rate, and a UI designed against
over-acceptance. That answers a gap an industry roadmap body has formally named and not closed, and
it is defensible in a way "our model got 0.86" never is.

---

## 2. Fixing the data problem — without new data access

You said public datasets only. The fix is not more datasets; it is **using a dataset where the
causal link is real.**

### PHM 2016 Data Challenge — CMP removal rate

Chaired by **Seagate** and **Siemens Corporate Technology**. Predict per-wafer material removal rate
as pad and dresser degrade. **25 input columns**, including consumable-usage counters
(`USAGE_OF_BACKING_FILM`, `DRESSER`, `POLISHING_TABLE`, `MEMBRANE`, `PRESSURIZED_SHEET`), five
pressures, three slurry flow lines, three rotation rates.

Why this changes everything for us:

- **The process sensors and the outcome are measured on the same wafers.** The causal link is real,
  not asserted. No constructed pairing anywhere in the chain.
- Consumable-usage counters are present — *tool state degradation is in the data*, which is exactly
  the mechanism our batch-risk story claims.
- It is a **published benchmark with a published scoring rule**: MSE 90% + **physics-based modelling
  approach 10%** (dresser condition 3%, pad condition 3%, other parameter effects 4%). A benchmark
  that explicitly reserves marks for interpretability is a gift for this project.
- The winning approach (Di, Jia & Lee, Cincinnati) is published, so we have a named baseline.

**Keep WM-811K** for the vision component — it is real, standalone, and needs no pairing. **Keep
SECOM** as a secondary anomaly-detection demo, clearly labelled.

**Retire the fabricated joins entirely.** No more `lots.json` mapping invented lot IDs onto
constructed sensor signatures. That single change removes the deepest credibility problem in the
project.

### The honest framing to use

> "We use three real public datasets, each for what it genuinely contains: PHM 2016 CMP for
> process→outcome prediction where the link is measured, WM-811K for spatial defect classification,
> SECOM for imbalanced anomaly detection. We do not join datasets that were never joined."

---

## 3. Architecture

Named layers, named algorithms, mapped to the SEMI standards a fab engineer already uses. This is
what makes it read as a product rather than a hackathon.

### 3.1 Ingestion & semantic layer

| Layer | Standard | What it gives us |
|---|---|---|
| Equipment control/events | **SEMI E30 (GEM)**, E5 (SECS-II), E37 (HSMS) | recipe IDs, state changes, alarms |
| Material↔recipe join | **E40** Process Jobs, **E94** Control Jobs | which wafer ran which recipe |
| Per-wafer location | **E90** Substrate Tracking | chamber-level commonality — impossible without it |
| Recipe-step boundaries | **E157** Module/Substrate Process Tracking | step-aligned trace windows |
| Clock discipline | **E148** TS-Clock | *without this, cross-tool joins have unfixable skew* |
| High-volume trace | **EDA / Interface A** — E120 CEM, E125 EqSD, E134 DCM, **E164** Common Metadata | trace = rate + parameter set + start/stop trigger |
| Wafer/die maps | **E142** Substrate Mapping | die-level traceability to assembly and final test |
| APC module boundaries | **E133** — R2R, FD, FC, **FP**, SPC | our at-risk predictor *is* E133's Fault Prediction group |

Two things to say out loud because they signal real domain knowledge: **E164 conformance** is what
lets one data-collection plan work across vendors, and **E134 defines a Performance Status
mechanism** because aggressive collection loads the tool's interface computer — data collection is a
capacity-planning exercise, not a free lunch.

**The semantic layer is the load-bearing tier.** PDF Solutions names it as a distinct layer between
normalisation and AI/ML, and Synopsys calls theirs a *Synchronized Component Architecture*. The join
keys — lot / wafer / die / tool / chamber / step / recipe — are modelled **once**, centrally. The
UI's linked-selection behaviour is derived from that model; get it wrong and every view disagrees.

### 3.2 Analysis layer — named methods, not "AI"

Ordered cheapest-first. **Each tier must be beaten by the next before the next ships.**

**Tier 0 — statistical baselines that must exist before any ML**
- **Yield decomposition**: `DY = YS · e^(−A·D0)`, fitted by linear regression on `ln DY` across
  products of differing die area — separates *systematic* from *random* yield loss without needing
  defect inspection. Poisson / Murphy / Seeds / negative binomial, with the α correspondence
  (α ≥ 10 ≈ Poisson, α = 5 ≈ Murphy, α = 1 ≈ Seeds) so one model covers all three.
- **Edge loss is a named trap** — it shows up as die-yield loss but is not defect-driven. Attributing
  it to D0 corrupts the estimate.
- **Commonality analysis** — the actual first question a yield engineer asks. Rank tool / chamber /
  recipe / step / operator / time-window by effect size with sample counts.
- **PAT / DPAT / GDBN** per **AEC-Q001 Rev-D**, implemented literally: robust mean = median, **robust
  sigma = (Q3−Q1)/1.35**, limits at ±6 robust sigma. GDBN needs the die-level XY map, i.e. E142.
- **Chamber / tool-to-tool matching** via PCA + MANOVA, or the difference-score approach
  (variance and number of modes) — and note the published finding that **golden-reference matching
  fails in production** because the golden reference is unobtainable in a heterogeneous fleet.

**Tier 1 — prediction with calibrated uncertainty** *(the differentiator)*
- Gradient boosting on the PHM CMP data as the point model. **Calibrate expectations: R² ≈ 0.70 is a
  good result on real mass-production CVD data** (Samsung Austin, 715 features). Graph attention on
  real production deposition data beat an MLP by **+0.012 R²** (ASU / Intel Foundry). Anyone
  promising a large architectural lift on fab sensor data is not calibrated.
- **Conformal prediction (CV+ via MAPIE)** for distribution-free intervals. This is the 1.9% → >80%
  result and the single highest-value change in this plan.
- **Report conditional coverage stratified by target percentile**, not just marginal coverage —
  because coverage degrades near the control limits, which is where the decisions are.

**Tier 2 — abstention** *(the thing nobody ships)*
Two independent gates, both from the NCKU AVM lineage (verified from the patents, not the
summaries):
- **RI — output confidence**: overlap area between two *structurally different* models' predictive
  distributions. Threshold derived from a **business-defined maximum tolerable error**, not a round
  number.
- **GSI — input novelty**: Mahalanobis distance to the training set. Threshold ≈ 2–3× max training
  GSI. This catches *"I have never seen input like this"*, which RI cannot.

Abstain if either gate fails. Then report **abstention rate and accuracy on retained vs abstained
subsets** — almost nobody publishes this, and it is the only way to show abstention is real.

> **Correction worth carrying:** the commonly quoted "RI > 0.7" is wrong. RI's threshold is derived
> from a tolerable error limit; the fixed 0.7 / 0.3 thresholds belong to the **Device Health Index**
> in a different NCKU patent.

**Tier 3 — the agent**
Bob orchestrates MCP tools as today. The reasoning layer *narrates and ranks over Tier 0–2 outputs*
and may not invent a claim those tiers did not produce. Confidence is inherited from the calibrated
layer, never generated by the LLM — which also retires the keyword-matching caps.

### 3.3 Model serving

Swappable reasoning provider behind one interface (you chose "Bob yes, watsonx optional"). Keep
watsonx Granite as a working provider; allow a stronger model where it measurably helps. The
provider becomes a config value, and `pipeline_status` reports which is live.

---

## 4. Evaluation — what we report

The metric set, grounded in what the verified literature actually reports.

**Accuracy** — MAPE and **max error** (a single bad prediction feeding R2R is the failure mode),
R², RMSE, plus MSE against the PHM 2016 scoring rule.

**Intervals** — empirical coverage at stated α; **conditional coverage near spec limits**; interval
width relative to the control-limit range; and **the point-vs-interval excursion sensitivity pair**,
which is the most persuasive number available.

**Abstention** — abstention rate; accuracy on retained vs abstained; per-variable attribution on
abstention, so an engineer gets *"abstained because parameter X drifted"* rather than a refusal.

**Operational — what a fab actually buys**
- **Alarms per chamber per day.** Verified baseline: traditional FDC runs **100–500/chamber-day**;
  the competitive pitch is **<50**. Report this or alarm precision is unanchored.
- False-alarm and missed-detection rates separately, with the operating point named.
- **Model build cost.** Traditional FDC: **7–10 weeks** to create, validate and deploy per
  recipe/tool. *The real competitor is engineering time, not accuracy.* A self-refreshing model is
  worth more than one that is 2% better.

---

## 5. The UI

Full detail in [`03-product-and-ux.md`](03-product-and-ux.md). The decisions:

**Stack** — Vite + React + TypeScript · React Router (data mode, SPA) · **IBM Carbon Design System** ·
**Apache ECharts** (canvas) · TanStack Table + Virtual. Backend promoted from `http.server` to
FastAPI. **Not Next.js**: no SEO, no anonymous traffic, an existing Python backend — the App Router's
server/client boundary buys nothing here and its API has renamed twice recently.

**Carbon, for four compounding reasons**: it is IBM's own system and this is an IBM hackathon; its
data table is built for dense data; **Carbon for AI already specifies the AI-label + explainability-
popover contract** that solves our hardest requirement — an engineer must never mistake a model's
guess for a measurement; and dark/light are co-equal first-class themes.

**ECharts because of one number**: its own docs put the canvas/SVG crossover at **~1,000 elements**.
A 300 mm wafer is 10k–100k dies. That kills Recharts (SVG-only) and Vega-Lite for die-level views.

**Visual language from ANSI/ISA-101**: grey base, **colour reserved for abnormality** — ~90% of the
screen neutral. Density comes from typography and alignment, never colour. This is most of the
answer to "not overwhelming."

**Alerts per ISA-18.2 / EEMUA 191**: almost everything our model emits is a **notification**, not an
alarm. TR18.2.8 governs non-alarm notifications. Track alert-rate-per-engineer from day one —
nuisance flooding is how this product category fails.

**Palettes**: **cividis** for sequential (optimised so colour-blind and non-colour-blind viewers see
effectively the same image — two engineers in a disposition meeting must be describing the same
picture), Okabe-Ito for categorical, RdBu for deltas. **Never rainbow/jet on a wafer map.**

**Light theme default** — counter-intuitive but evidenced: negative polarity is worst under dim
ambient light, and the positive-polarity advantage *grows as font size shrinks*, which is the regime
of a dense table.

**The screen that matters — Lot Decision View**, ordered deliberately:
1. The decision stated plainly — lot, wafers, value at risk, deadline.
2. **The engineer records their own read first**, before AI suspects are revealed. Cognitive forcing
   function — the only intervention shown to reduce over-reliance. Architecturally first.
3. Ranked suspects with **partial explanations** by default, and **contradicting evidence** plus
   *"what would change this conclusion"* at equal visual weight.
4. Disposition requires a typed rationale. **No one-click accept, ever.**

---

## 6. What this becomes as a pitch

> "Everyone at this hackathon built something that predicts. The industry's own roadmap body says
> prediction is not the blocker — *communicating confidence* is. So we built the layer that knows
> when not to answer.
>
> A point prediction catches 1.9% of out-of-control batches. A calibrated interval catches over 80%.
> Same model. We ship the interval, we ship the abstention gate, and we report our abstention rate —
> which almost nobody does.
>
> And we designed the UI against the human-factors finding that explanations make experts *more*
> likely to accept wrong AI answers. The engineer commits their own read before ours appears."

That is a product thesis. "Our F1 is 0.86" is not.

---

## 7. What actually fits in 48 hours

Four people, parallel tracks, frozen interfaces — the split that worked last time.

### Must land (this is the submission)

| Track | Owner | Deliverable |
|---|---|---|
| **A · Real data** | 1 person | PHM 2016 CMP ingested. Gradient boosting point model. **Conformal intervals via MAPIE.** Report coverage + the point-vs-interval sensitivity pair. Retire `lots.json` fabrications. |
| **B · Abstention** | 1 person | RI (two structurally different models, distribution overlap) + GSI (Mahalanobis novelty). Abstention rate, and accuracy retained vs abstained. |
| **C · UI** | 1–2 people | Vite + React + Carbon. **Three screens only**: Excursion Queue, Lot Decision View (with the cognitive-forcing step), Wafer Map Explorer. ECharts canvas wafer map, cividis, grey base. |
| **D · Integration** | lead | MCP tools re-pointed at the new layers. Confidence *inherited*, not LLM-generated. Delete the keyword caps. Eval harness reports the new metric set. |

### Explicitly deferred — and say so on stage

SEMI ingestion layer · semantic model across a real fab schema · commonality analysis · PAT/GDBN ·
chamber matching · yield decomposition · the other five UI screens · multi-user, auth, persistence.

**Name these as roadmap with the standards attached.** "Our ingestion layer targets E90 substrate
tracking and E157 step boundaries, with E148 clock discipline, because cross-tool joins are
unfixable without it" demonstrates more domain command than a half-built version would.

### Cut, and do not mourn

Mixed-defect multi-label · SOTA vision architectures (**the classifier at macro-F1 0.86 is the least
broken thing you have**) · live watsonx tuning · anything needing data you do not have.

---

## 8. The one risk worth naming

Two days is not enough to rebuild everything, and the failure mode is **breaking what currently
works**. The MCP layer, Bob orchestration and eval harness are genuinely good. Track D must treat
them as load-bearing and re-point them, not rewrite them.

If a track slips, **ship Track A alone**. Real data with calibrated intervals and an honest coverage
table, on the existing UI, still clears a higher bar than what you have now — because it removes the
fabricated-pairing problem, which is the thing a sharp judge will find.

---

## 9. Sources

**Standards** — [SEMI E133](https://store-us.semi.org/products/e13300-semi-e133-specification-for-automated-process-control-systems-interface) ·
[E30 GEM](https://store-us.semi.org/products/e03000-semi-e30-specification-for-the-generic-model-for-communications-and-control-of-manufacturing-equipment-gem) ·
[E87 CMS](https://store-us.semi.org/products/e08700-semi-e87-specification-for-carrier-management-cms) ·
[E142 Substrate Mapping](https://store-us.semi.org/products/e14200-semi-e142-specification-for-substrate-mapping) ·
[E10 RAM](https://store-us.semi.org/products/e01000-semi-e10-specification-for-definition-and-measurement-of-equipment-reliability-availability-and-maintainability-ram-and-utilization) ·
[E79 Productivity/OEE](https://store-us.semi.org/products/e07900-semi-e79-specification-for-definition-and-measurement-of-equipment-productivity) ·
[PEER Group standard definitions](https://www.peergroup.com/resources/semi-standards/eda/) ·
[Kontron SEMI standards map](https://kontron-ais.com/en/resources/semi-standards) ·
[Cimetrix EDA/Interface A whitepaper](https://www.cimetrix.com/hubfs/docs/Whitepapers/Introduction-to-EDA-WhitePaper.pdf)

**Algorithms** — [AEC-Q001 Rev-D (PAT)](http://www.aecouncil.com/Documents/AEC_Q001_Rev_D.pdf) ·
[Leachman, Yield Modeling and Analysis (IEOR 130)](https://fog.misty.com/perry/cod/references/yield_models.pdf) ·
[Tool-to-tool matching, arXiv:2507.10564](https://arxiv.org/pdf/2507.10564) ·
[Onto Discover Yield (PCA/MANOVA, chamber matching)](https://www.ontoinnovation.com/products/discover-yield)

**Virtual metrology & calibration** — [IRDS VM White Paper (NIST)](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=924090) ·
[Merck/Versum conformal prediction, arXiv:2605.07752](https://arxiv.org/html/2605.07752) ·
[Samsung Austin CVD VM, arXiv:2107.05071](https://arxiv.org/abs/2107.05071) ·
[Graph-attention VM (ASU/Intel), arXiv:2606.00923](https://arxiv.org/abs/2606.00923) ·
[NCKU RI/GSI patent US7593912B2](https://patents.google.com/patent/US7593912B2/en) ·
[NCKU dual-phase VM US7603328B2](https://patents.google.com/patent/US7603328B2/en) ·
[NCKU DHI/DCI US11378946B2](https://patents.google.com/patent/US11378946B2/en) ·
[STMicroelectronics Catania PdM (Sensors 23:6249)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10385765/) ·
[BISTel DFD datasheet (alarm rates, model build time)](https://www.synopsys.com/content/dam/synopsys/silicon/datasheets/bistel-dfd.pdf)

**Data** — [PHM 2016 Data Challenge CFP](https://phmsociety.org/wp-content/uploads/2016/05/PHM16DataChallengeCFP.pdf) ·
[Winning CMP VM approach (Di, Jia & Lee)](https://papers.phmsociety.org/index.php/ijphm/article/view/2641)

**Platform architecture** — [Synopsys Yield Explorer datasheet](https://www.synopsys.com/content/dam/synopsys/silicon/datasheets/YieldExplorer-ds.pdf) ·
[PDF Exensio platform](https://www.pdf.com/products/exensio-analytics-platform/overview/) ·
[SemiEngineering, The Petabyte Problem](https://semiengineering.com/the-petabyte-problem-how-ai-is-finally-making-semiconductor-manufacturing-data-actionable/) ·
[INFICON FabGuard FDC](https://www.inficon.com/en/products/intelligent-manufacturing-systems/fabguard-fdc) ·
[Siemens Opcenter Execution Semiconductor](https://www.siemens.com/en-us/products/opcenter/execution/semiconductor/)

**UI/UX** — see [`03-product-and-ux.md`](03-product-and-ux.md) for the full list.

---

## 9b. What was built, and where it diverged from this plan

Written after the fact. The plan is left as written above; this section records what
actually shipped, because a plan silently edited to match the outcome is worth nothing.

| Track | Status | Divergence |
|---|---|---|
| **A · Real data** | done | `lots.json` was **not** retired. Kept alongside CMP and labelled `constructed` per `provenance.py`, because CMP has no wafer maps and so cannot carry the vision classifier (macro-F1 0.9232) or the root-cause demo. Deleting it would have cost the strongest measured result in the project. |
| **B · Abstention** | done | GSI does not fire on this data — ROC-AUC 0.450 separating a held-out stage, below chance. Stage A and B differ in their input→outcome mapping, not their input distribution: concept drift, which GSI does not measure. RI carries the gate (1.76× error ratio). Recorded as a negative result rather than tuned away. |
| **C · UI** | done differently | **Next.js, not Vite + Carbon** — a working 11-screen console already existed and rebuilding it would have cost the two days for no gain. Carbon's real value was the AI-label contract, implemented directly instead. **No ECharts**: the wafer map is still SVG. Canvas only pays off at die-level resolution (10k–100k dies) and we have no die-level data. Screens went to 11 live rather than 3, but every one reads the API — the plan's concern was depth over breadth, and the depth is in the data wiring. |
| **D · Integration** | partial | Tools re-pointed, confidence inherited in the Copilot, eval harness now reports the §4 metric set. **The keyword caps were not deleted.** |

### Why the keyword caps are still there

§3.2 says confidence is inherited from the calibrated layer, "which also retires the
keyword-matching caps." Only `predict_removal_rate` has a calibrated layer — conformal
intervals with 94.0% measured coverage. Nothing calibrated sits behind lot reasoning, so
deleting the ceilings would not produce calibrated confidence; it would produce
ungoverned LLM confidence, which is strictly worse.

They stay, relabelled as what they are: a **policy control**, not calibration. Every
hypothesis now carries `confidence_basis: "llm_uncalibrated"` so no consumer can present
it as a probability, and every applied ceiling records `_policy_ceiling` and
`_capped_because`. Retiring them for real needs a calibrated ranking layer. That is
roadmap, and saying so is more honest than deleting the guardrail and claiming the
milestone.

---

## 10. Gaps in this research, stated plainly

The session hit its rate limit before three streams finished. Not yet verified, and therefore **not
relied on above**: SOTA wafer-defect architectures for 2026, rigorous RCA attribution methods
(causal discovery, SHAP attribution, partial-trajectory regression), the broader fab-dataset survey,
and agent/tool-use evaluation frameworks. The plan deliberately leans on what *was* verified.

Also unverified and deliberately not cited: KLA's Klarity/SSA product claims (kla.com blocks
automated access), INFICON FabGuard SPC chart inventory, and any Infineon/Intel/TSMC/Micron PdM case
study with numbers. The "50 TB/day per fab" figure that circulates widely traces to no primary
source — **do not use it.**
