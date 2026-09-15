# Problem Statement

## The problem

At 3nm and 5nm process nodes, a 1% yield drop costs a fab tens of millions of dollars per
month. When yield falls, the cause is hidden somewhere across thousands of equipment
sensors, hundreds of process steps, and defect imagery from multiple inspection tools.

Finding it is manual. A process engineer pulls wafer maps from one system, sensor traces
from another, tool maintenance logs from a third, and correlates them by hand and by
memory. That takes days to weeks. **Every day of delay is lost revenue on wafers that are
still running.**

The second half of the problem is worse, because it is invisible: engineers only start
looking *after* a lot has failed test. Lots whose planned process parameters already
resemble historical low-yield profiles run anyway, because nobody flagged them in advance.

## Who experiences it

| Persona | What they need | What they do today |
|---|---|---|
| **Process / Yield Engineer** | "Why did this lot fail, and what do I do about it?" | Manually correlates wafer maps, sensor traces and tool logs across disconnected systems |
| **Fab Ops Manager** | "Which upcoming lots are at risk before they run?" | Largely reactive — risk is discovered at electrical test, after the material is committed |
| **Failure Analysis Lab** | "Turn this excursion into an actionable report" | Writes the report by hand, re-deriving context each time |

## Why existing tooling doesn't close the gap

Commercial yield management platforms — Spotfire, Synopsys Silicon.da, PDF Solutions
Exensio, yieldHUB — are genuinely good at what they do: unifying data and surfacing
correlations. What they leave to the engineer is the **last mile**: going from "these
variables correlate" to "here is a ranked, evidence-cited hypothesis, and here is what to
do about it."

That last-mile judgement is the target of this solution.

**We are not claiming the forward-looking half is unexplored.** Predicting a lot's outcome
from process parameters before metrology exists has a standardised name — **Virtual
Metrology**, defined in **SEMI E133**, where *fault prediction* is a named functional group
alongside run-to-run control, fault detection and SPC. Tignis ships virtual metrology
inside a controller; INFICON's FabGuard SmartFDC ships unsupervised trace-shift detection
in production fabs. This is a mature field and we enter it with its own vocabulary.

**The gap is not accuracy.** The IRDS virtual-metrology white paper surveys APC
practitioners, and the blockers they name are model trust, data quality, absent
process-knowledge correlation, model maintenance under context shift, and the absence of a
standardised prediction-quality metric. The numbers back this up: the best published
rare-class model on fab sensor data runs **recall 0.96 at precision 0.66** — roughly **one
in three flagged lots is a false alarm**. The binding constraint is an engineer's triage
time, not the AUC.

So the genuinely open problem is *explanation*: a flag an engineer cannot quickly verify
is a flag they will learn to ignore. Two things remain unclaimed in the published
literature, and both are what this project builds:

1. **Cross-module fusion** — wafer-map pattern, sensor-trace anomaly and process-route
   context reasoned over together as one causal narrative. Today these live in three
   disconnected tools.
2. **A forward-looking risk predictor combined with an agentic reasoning layer.** Pure-ML
   virtual metrology exists; post-hoc root-cause attribution exists (IBM and NY CREATES
   published partial-trajectory regression on real fab data in 2025). The combination
   appears nowhere, and no cloud vendor publishes on it.

## Why now

Two things became production-viable in the last eighteen months. Vision foundation models
cut the labelled-data requirement for defect classification dramatically — NVIDIA reports
93.84% → 98.51% using 1M unlabelled and only 600 labelled images. And agentic tool-calling
matured to the point where an LLM can gather its own evidence rather than being handed a
fixed prompt: Microsoft Research found that a retrieval-equipped agent produced "highly
increased factual accuracy" over generate-from-summary on real production incidents.

The specific combination this project targets — vision classification, tabular anomaly
detection, and a tool-using agent that fuses them into a ranked, cited explanation — has
exactly one close published precedent (SemiFA, arXiv 2604.13236, a single-author preprint).
Timely, but not yet commoditised.

## The honest constraint

**No fab publicly releases root-cause-labelled incident data.** It is proprietary by
nature. This solution is therefore built and validated against two real public datasets
plus the published failure-mode literature — not against a disclosed fab incident history.

- **SECOM** (UCI): 1,567 real observations, 590 sensor features, 104 labelled failures
  (6.64%), ~4.5% missing values. A genuine 1:14 class imbalance.
- **WM-811K / LSWMD**: 811,457 real wafer bin maps from a 300mm production line. 172,950
  are expert-labelled, of which only **25,519 carry an actual defect pattern** — the rest
  are "none". It is **8 defect patterns plus "none"**, not nine defect types.

**SECOM and WM-811K are separate, unrelated datasets.** They do not come from the same
fab, the same line, or the same lots. Every case study in this project that pairs a wafer
map with a sensor signature is a **constructed pairing for demonstration purposes, not a
real joined record.** The eighteen sub-cases are constructed from the real WM-811K defect
taxonomy and documented fab failure modes — they are not disclosed incidents.

We state this plainly here, in `README.md`, and in the demo itself. A system whose whole
value proposition is honest, evidence-cited reasoning cannot begin by overclaiming its own
provenance.

Full sourcing: [`research/engineering-references.md`](research/engineering-references.md).
