# v2 · Product design & UX

Research-backed. Companion to [`00-PLAN.md`](00-PLAN.md).

---

## 0. The finding that should change our thinking

We have been building on the premise that **citing evidence makes an AI recommendation safe**. The
HCI literature says that is wrong, with causal evidence:

- **Bansal et al., CHI 2021** — across three datasets, AI augmentation produced complementary gains,
  but **explanations did not increase them**. Explanations raised the rate at which humans accepted
  the AI's recommendation *regardless of whether it was correct*.
- **Buçinca, Malaya & Gajos, 2021** — **explanations do not reduce over-reliance and may increase
  it.** The only interventions that measurably reduced it were **cognitive forcing functions**:
  making the human commit their own judgement before seeing the AI's.
- **CHI 2026 review of appropriate reliance** — showing calibrated uncertainty **alone is inadequate**.
- A 2025 follow-up found **partial** explanations reduce over-reliance relative to full ones.

Our evidence-citation rule is necessary but not sufficient. On a screen whose action is *scrap a
lot*, an explanation UI not explicitly designed against over-acceptance makes the decision **worse**.

**Structural consequences, not cosmetic ones:**

1. The engineer records **their own hypothesis and confidence first**, before ranked suspects appear.
2. **Partial explanations by default** — top evidence and effect size — full evidence one click away.
3. Every suspect shows **contradicting evidence** and **"what would change this conclusion"** at the
   same visual weight as supporting evidence.
4. Confidence is **never** the headline. It appears as inspectable evidence — n wafers, effect size,
   baseline comparison — not a detached percentage badge.
5. **No one-click accept of a model recommendation.** Disposition requires a typed rationale.

This is also a better story than "we cite our sources": we read the human-factors literature and
designed against the failure mode it identifies.

---

## 1. Stack

**Vite + React + TypeScript · React Router (data mode, SPA) · IBM Carbon Design System ·
Apache ECharts (canvas) · TanStack Table + Virtual · cividis / Okabe-Ito / RdBu**

Backend: promote `http.server` to FastAPI serving a JSON API plus the built static bundle.
**All filtering, aggregation and top-N ranking happen server-side in Python** — TanStack's own docs
are explicit that virtualisation is not a substitute for server-side paging, because virtualised
rows still have to be in the browser.

### Why not Next.js

Not a bad framework — an unjustified one here. No SEO requirement, no anonymous traffic, no
marketing surface, and an existing Python backend. Against that, the App Router adds a
server/client component boundary, a framework caching layer, and an API that renamed twice recently
(PPR → Cache Components in Next 16). React Router data mode gives the one thing we need —
**URL-as-state, so every investigation is a shareable link** — without the RSC mental model.

### Why Carbon

1. It is **IBM's own design system**, and this is an IBM hackathon.
2. Its **data table is explicitly designed for dense data** — sortable/filterable columns, batch
   actions, expandable rows, multiple row heights.
3. **Carbon for AI** specifies the contract for our hardest requirement: every AI component carries
   an **AI label plus an explainability popover**, with dedicated AI-layer tokens, so model output is
   always visually distinguishable from measured data. We were going to invent this badly.
4. Dark and light are co-equal first-class themes.

**Risk:** Carbon's data table is not a data *grid* — no virtualisation, pivoting, column pinning or
grouping. Keep the table behind one internal `<DataTable>` wrapper from the first commit so the
engine can be swapped for `tanstack-carbon`-style composition without touching views.

### Why ECharts — one charting dependency

ECharts' own docs give the threshold: **use canvas above ~1,000 elements**, specifically for
heatmaps and large scatter. A 300 mm wafer is 10k–100k dies — one to two orders of magnitude past
where SVG stops working. ECharts covers every chart we need on canvas: heatmap with `visualMap` for
the wafer map, `brush` for region select, `dataZoom` for time series, `connect` for linked selection,
plus boxplot and parallel coordinates for commonality.

**This rules out Recharts** (SVG-only) and **Vega-Lite** for die-level views — Vega-Lite's own
ecosystem documents that it "fails to provide low-latency interactions as dataset sizes grow to
millions". Both remain fine for aggregated summaries.

**Prior art confirms the pattern**: every web wafer-map implementation found — SciChart's React
wafer-analysis demo, `wafertools/tsmap`, several WebGL demos — uses **canvas or WebGL with one
instanced rectangle per die plus crossfilter-style linked selection**. Nobody does this in SVG.

---

## 2. Visual language: quiet when the fab is quiet

From **ANSI/ISA-101.01** and the high-performance HMI tradition (evidence-based on ASM Consortium
research): **grey-scale base, saturated colour reserved for abnormal conditions** — roughly 90% of
the screen neutral. Red means alarm or safety-critical only; amber is advisory.

This single rule is most of the answer to "not overwhelming." **Density comes from typography and
alignment, never from colour.**

| Use | Palette | Why |
|---|---|---|
| Sequential (yield, defect density) | **cividis** | Optimised so colour-blind and non-colour-blind viewers see effectively the same image. Two engineers in a disposition meeting must be describing the same picture. |
| Categorical (tool, chamber, recipe, bin) | **Okabe-Ito** | 8–9 nameable CVD-safe colours; recommended by *Nature Methods*. |
| Diverging (lot vs baseline) | **RdBu / PuOr** | ColorBrewer, colour-blind-safe. |

**Never rainbow or jet on a wafer map** — engineers read false boundaries at the green/cyan
transition that are not in the data.

**Light theme is the default.** Counter to instinct, and evidenced: NN/g and the contrast-polarity
literature find light mode performs better for normal or corrected vision, negative polarity is
*worst* under dim ambient light, and **the positive-polarity advantage grows as font size shrinks** —
exactly the regime of a dense table. Dark ships as an equal-quality option with a larger minimum
type size, selected by deployment environment (dim fab control room vs office desk) per ISO 11064 —
not buried as a taste toggle.

---

## 3. Alerts: almost nothing we emit is an alarm

**ANSI/ISA-18.2** and **EEMUA 191 (4th ed., Nov 2024)** are the governing, mutually aligned
standards. The relevant part is **ISA-TR18.2.8, Guidelines for Non-Alarm Notifications**:

- An **alarm** is rationalised — stated consequence, defined required operator response.
- Everything our model produces is a **notification** — an "insight", dismissible, reviewable,
  never blocking.

Two hard requirements: a one-page **alarm philosophy** before building the alert UI, and
**alert-rate-per-engineer** tracked from day one. For calibration: traditional FDC runs
**100–500 alarms/chamber/day**; the competitive target is **<50**.

---

## 4. Information architecture

Skeleton from **Shneiderman's 1996 taxonomy** — *overview first, zoom and filter, details on demand* —
plus the three usually-forgotten tasks, each given a home: **relate**, **history**, **extract**.

### Global shell

- **One scope bar** — product · technology · fab · lot · date range · tool/chamber. Set once,
  persists across views, encoded in the URL. The Datadog DRUIDS lesson: consistency of the
  filter + time-scope + drill triad across every view matters more than any individual chart.
- **Command palette (⌘K)** — jump to lot, wafer, tool or saved view. Expert users navigate by typing.
- **Notification tray**, tiered alarm vs notification per TR18.2.8.

### 1 · Excursion Queue — *what needs me now*

Landing screen. **One dense, sortable, keyboard-navigable table**: lot, product, step, yield delta vs
baseline, time open, disposition deadline, owner, status. Grey rows; colour only on the priority chip.
**No KPI tiles, no gauges, no donuts.** The overview is one thing, not twelve widgets.

### 2 · Lot Decision View — *the scrap-or-not screen*

Highest-consequence screen, built around one irreversible action. **Order is the design:**

1. **The decision stated plainly** — lot, wafers affected, value at risk, deadline.
2. **The engineer's own read, recorded first.** Cognitive forcing function — architecturally first.
3. **Ranked suspects** — Carbon AI label + explainability popover; partial explanation by default;
   contradicting evidence and falsification conditions at equal weight; **confidence inherited from
   the calibrated layer**, shown as evidence rather than a badge.
4. **Disposition** — consequence spelled out, typed rationale required.

### 3 · Wafer Map Explorer

- **25-wafer lot as faceted small multiples** — fastest way to see systematic vs wafer-specific.
- **Zone summary before the die map.** Borrowed from Spotfire's radial/angular zone analysis: a
  low-cardinality table of loss per radial and angular zone answers "where is it clustering" above
  the fold — and doubles as the keyboard-accessible, screen-reader-readable equivalent of the canvas.
- **Die map** — ECharts canvas heatmap, cividis, brush-to-select linked into die table and trends.
  Toggleable reticle grid, bin codes, radial rings.
- **Pattern named using the nine WM-811K classes**, with the reference exemplar shown beside our
  wafer so the engineer judges the match rather than trusting a label.

### 4 · Commonality / Evidence — *relate*

Ranked contributors across tool, chamber, recipe, step, operator, time window — each row showing
**sample size, effect size and baseline comparison as bars, not percentages**. Parallel coordinates
for interaction. Every row drills to the underlying wafer set and terminates in **identifiable dies
an engineer can physically pull** (Synopsys' part-level traceability).

### 5 · Trend / SPC

Time series per tool × chamber × parameter, excursion window shaded, brushing linked to the wafer
map. Control limits and spec limits drawn distinctly.

### 6 · Comparison

Two or more lots/wafers/tool sets side by side, same scales, diverging delta map. Answers *"is this
new, or has it always been like this."*

### 7 · Decision Log — *history + extract*

Every disposition: what the data showed, what the model said, what the engineer decided, why, and
**what happened afterwards**. Two jobs — the audit trail a high-consequence tool owes its users, and
our only honest measure of whether the model helps: it lets us compute how often engineers agreed
with the model **and how often that agreement was right**. That is the appropriate-reliance metric,
not a satisfaction score. Exportable as an evidence pack for the disposition meeting.

### 8 · Settings

Data sources and freshness · alarm philosophy and priority thresholds · model version, **abstention
rate and known limitations** · theme.

---

## 5. Accessibility bar

**WCAG 2.2 AA.** Three criteria bite us specifically:

- **2.4.11 Focus Not Obscured** — sticky headers over a long virtualised table must not obscure the
  focused row. The most commonly failed criterion in dense tables.
- **2.5.7 Dragging Movements** — every chart brush needs a **non-dragging alternative** (numeric
  range inputs, keyboard range selection).
- **2.5.8 Target Size** — 24 CSS px minimum. Dense row-action icons fail this by default.

**The canvas wafer map is the biggest accessibility risk** — canvas is opaque to screen readers.
This is why the zone-summary table and numeric range inputs are the map's **primary** interface,
with the canvas as visual companion. Not a retrofit.

---

## Sources

Carbon — [data table usage](https://carbondesignsystem.com/components/data-table/usage/) ·
[Carbon for AI](https://carbondesignsystem.com/guidelines/carbon-for-ai/) ·
[tanstack-carbon](https://github.com/carbon-design-system/tanstack-carbon) ·
Stack — [React Router v7 modes](https://blog.logrocket.com/react-router-v7-modes/) ·
[Next.js PPR guide](https://nextjs.org/docs/app/guides/ppr-platform-guide) ·
[TanStack virtualization](https://tanstack.com/table/v8/docs/guide/virtualization) ·
[shadcn vs MUI](https://vercel.com/i/shadcn-vs-material-ui) ·
Charting — [ECharts canvas vs SVG](https://apache.github.io/echarts-handbook/en/best-practices/canvas-vs-svg/) ·
[uPlot](https://github.com/leeoniya/uPlot) · [VegaFusion](https://arxiv.org/pdf/2208.06631) ·
[Vega-Altair large datasets](https://altair-viz.github.io/user_guide/large_datasets.html) ·
[Mosaic](https://idl.uw.edu/mosaic/) · [Perspective](https://perspective-dev.github.io/) ·
Wafer-map prior art — [SciChart wafer analysis](https://www.scichart.com/demo/react/wafer-analysis) ·
[wafertools/tsmap](https://github.com/wafertools/tsmap) · [wafermap topic](https://github.com/topics/wafermap) ·
HMI & alarms — [ANSI/ISA-101.01](https://www.isa.org/products/isa-101-01-2015-human-machine-interfaces-for) ·
[High-performance HMI rules](https://img.controlglobal.com/files/base/ebm/controlglobal/document/2022/08/1661879878912-cg1709highperformancehmirulesandprinciples.pdf?dl=1661879878912-cg1709highperformancehmirulesandprinciples.pdf) ·
[ISA-18 series](https://www.isa.org/standards-and-publications/isa-standards/isa-18-series-of-standards) ·
[EEMUA 191](https://www.eemua.org/products/publications/digital/eemua-publication-191) ·
[ISO 11064-1](https://www.iso.org/obp/ui/#iso:std:iso:11064:-1:ed-1:v1:en) ·
Human-AI decision-making — [Bansal et al. CHI 2021](https://dl.acm.org/doi/10.1145/3411764.3445717) ·
[Buçinca et al. 2021](https://arxiv.org/abs/2102.09692) ·
[Partial explanations](https://dl.acm.org/doi/10.1145/3710946) ·
[CHI 2026 appropriate reliance](https://dl.acm.org/doi/10.1145/3772318.3791467) ·
[Padilla uncertainty visualisation](http://space.ucmerced.edu/Downloads/publications/Uncertainty_Visualization_Padilla_Kay_Hullman_2022.pdf) ·
[Microsoft HAX Toolkit](https://www.microsoft.com/en-us/haxtoolkit/) ·
IA references — [Shneiderman 1996](https://www.cs.umd.edu/~ben/papers/Shneiderman1996eyes.pdf) ·
[NN/g progressive disclosure](https://www.nngroup.com/videos/progressive-disclosure/) ·
[DRUIDS (Datadog)](https://www.datadoghq.com/blog/engineering/druids-the-design-system-that-powers-datadog/) ·
[Grafana Saga](https://grafana.com/blog/2023/11/07/saga-design-system-shaping-the-future-of-user-experiences-at-grafana-labs/) ·
[Spotfire zone analysis](https://www.spotfire.com/blog/2025/09/18/from-data-to-decisions-unveiling-wafer-level-insights-with-zone-based-analysis-in-spotfire-data-science/) ·
[Synopsys Silicon.da](https://www.synopsys.com/ai/ai-powered-eda/silicon-da.html) ·
Accessibility — [WCAG 2.2](https://www.w3.org/TR/WCAG22/) ·
[cividis (PLOS ONE)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0199239) ·
[Okabe-Ito](https://easystats.github.io/see/reference/scale_color_okabeito.html) ·
[NN/g dark mode](https://www.nngroup.com/articles/dark-mode/) ·
[contrast polarity & legibility](https://pubmed.ncbi.nlm.nih.gov/28166901/)
