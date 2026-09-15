# Engineering References — Verified Source Research

Every URL below was fetched and confirmed to resolve. Titles are the **real** titles, not
paraphrases. Where a claimed figure differed from the source, the source figure is used and the
discrepancy noted. Sources that 403'd or sat behind a login are listed at the bottom as unverified
rather than cited as if read.

Supersedes Part 1 of `S1_Wafer_Yield_Solution_Blueprint.md` and Appendix A of `PRD.md`.

---

## 0. Read this first — the prior-art problem

The PRD's headline differentiator is "flag upcoming batches before they run." **That capability has
a standardized name, an official SEMI definition, and shipping commercial products.**

- It is **Virtual Metrology (VM)**: predicting post-process metrology from process/wafer-state and
  sensor data. Defined in **SEMI E133**, the Automated Process Control Systems Interface spec.
- The flagging half is the **Fault Prediction** functional group in that same standard, alongside
  run-to-run control, fault detection, fault classification and SPC.
- **Tignis PAICe Maker** (now Cohu) ships VM built into a controller with real-time wafer-to-wafer
  recipe recommendations. **INFICON FabGuard SmartFDC** ships unsupervised trace-shift detection in
  production fabs. **PDF Solutions Exensio Aurora** (beta Sept 2026) ships LLM-enabled agents
  assembling yield workflows with feed-forward deployment to edge and test.

This does not sink the project — but the PRD claim that pre-run flagging is "the 'predict before it
runs' half that's easy to skip" needs rewording. It isn't unclaimed territory; it's a mature field
we're entering. **Adopt its vocabulary** (virtual metrology, fault prediction, feed-forward control,
excursion detection, lot disposition, wafers-at-risk) and a fab engineer will read the design as
fluent instead of naive.

**Where the gap genuinely is.** The IRDS VM white paper surveys APC practitioners and names the real
blockers — and none of them are accuracy: *model trust, data quality, absent process-knowledge
correlation, model maintenance under context shift, cost, IP security,* and *the lack of a
standardized prediction-quality metric*. The rare-event numbers confirm it: the best published rare-
class model on fab sensors runs recall 0.96 at precision 0.66, so **roughly one in three flagged
lots is a false alarm**. The binding constraint is an engineer's triage time, not AUC.

So three defensible positions remain, and all three are already in the plan:
1. **Cross-module fusion** — wafer-map pattern + trace anomaly + process-route context into one
   causal narrative. Today these live in three disconnected tools.
2. **Evidence-grounded disposition with honest confidence** — an LLM-native answer to IRDS's
   prediction-quality and model-maintenance asks. This is the PRD's evidence-citation NFR.
3. **Advisory-only by design.** The EWMA run-to-run stability literature proves any predictive
   signal injected into a fab sits inside a closed loop with a provable stability region. The PRD
   already refuses closed-loop control as a non-goal — **lead with that as rigor, not as a limitation.**

Also worth knowing: **nobody publishes the forward-looking predictor + LLM agent combination.** Pure-ML
VM exists, post-hoc attribution exists, but the combination is absent from the literature and no cloud
vendor publishes on it. That is simultaneously the most novel part of the design and the least supported.

---

## 1. Datasets (ground truth — figures corrected)

| Source | Real figures | Note |
|---|---|---|
| [SECOM (UCI ML Repository, ID 179)](https://archive.ics.uci.edu/dataset/179/secom) | 1,567 observations; **590 sensor features** (591 columns incl. label); **104 fails (6.64%)**, 1,463 passes; 41,951 NaNs ≈ **4.5% missing** | Plan's figures all check out |
| [WM-811K / LSWMD](https://ieeexplore.ieee.org/document/7092671) — Wu, Jang, Chen, "Wafer Map Failure Pattern Recognition and Similarity Ranking for Large-Scale Data Sets", IEEE Trans. Semicond. Manuf. 28(1):1–12, 2015 | 811,457 maps (~46,393 lots); **172,950 expert-labeled**, of which only **25,519 carry a defect pattern**; 147,431 are "none" | **Correction:** it is **8 defect patterns + "none"**, not "9 defect classes". Saying 9 implies nine defect types. Classes: Center, Donut, Edge-Loc, Edge-Ring, Loc, Random, Scratch, Near-full, none |
| MixedWM38 — Wang, Xu, Yang, Zhang, Li, "Deformable Convolutional Networks for Efficient Mixed-Type Wafer Defect Pattern Recognition", IEEE Trans. Semicond. Manuf. 33(4):587–596, 2020 · [IEEE 9184890](https://ieeexplore.ieee.org/document/9184890) · [data](https://github.com/Junliangwangdhu/WaferMap) | **38,015 maps, 52×52, 38 classes** = 1 normal + 8 single + 13 two-mixed + 12 three-mixed + 4 four-mixed | **Correction:** the blueprint cited the SemiFA arXiv PDF for this dataset. Wrong paper entirely |

---

## 2. Wafer map defect classification (vision precedent)

| Source | What it says | Relevance |
|---|---|---|
| [Wafer Map Defect Classification Using Autoencoder-Based Data Augmentation and Convolutional Neural Network](https://arxiv.org/abs/2411.11029) — arXiv 2411.11029 | 98.56% on WM-811K; +19/21/27 points over RF/SVM/LogReg. Autoencoder augmentation to fight imbalance | Baseline approach for Track 1. **Different split and preprocessing — not comparable to our number** |
| [Semi-supervised imbalanced classification of wafer bin map defects using a Dual-Head CNN](https://www.sciencedirect.com/science/article/abs/pii/S0957417423028038) — Expert Systems with Applications, doi:10.1016/j.eswa.2023.122301 | Two heads (overall vs per-class accuracy) to stop the model ignoring rare defects | Exactly our Donut / Near-full scarcity problem |
| [Wafer map failure pattern classification using geometric transformation-invariant convolutional neural network](https://www.nature.com/articles/s41598-023-34147-2) — Sci. Rep. 13:8127 (POSTECH) | Radon transform + kernel flip for rotation/flip invariance | Maps get logged in different orientations across tools |
| [Wafer Defect Map Classification Using Sparse CNN](https://boracchi.faculty.polimi.it/docs/2019_ICIAP_Wafer_Classification_Sparse_CNN.pdf) — Politecnico di Milano, ICIAP 2019 | Handles the 15×15 → 200×200 native resolution range | Directly informs the ingestion/normalisation choice |
| [Using Deep Learning ADC for Defect Classification](https://ontoinnovation.com/resources/using-deep-learning-adc-for-defect-classification-for-automatic-defect-inspection/) — Onto Innovation, SPIE 2024 | CNN/DNN/KNN **ensembles**; production ADC judged on a **four-way scorecard**: accuracy, purity, classification rate, escape rate | **Adopt the four-way scorecard.** Vendor confirmation that plain accuracy is not how ADC is assessed |
| [MMAD: A Comprehensive Benchmark for MLLMs in Industrial Anomaly Detection](https://arxiv.org/abs/2410.09453) — arXiv 2410.09453, ICLR 2025 | 39,672 questions / 8,366 images. Best commercial model (GPT-4o) averages **74.9%**, stated as far short of industrial requirements | **Kills the "just prompt a VLM with the wafer map" baseline.** Justifies a dedicated classifier feeding the agent |
| [WaferSAGE: LLM-Powered Wafer Defect Analysis via Synthetic Data Generation and Rubric-Guided RL](https://arxiv.org/abs/2604.27629) — arXiv 2604.27629 | Rubric-guided QA synthesis from labeled maps; **4B Qwen3-VL scores 6.493 vs Gemini-3-Flash 7.149** | Solves two of our problems: no labeled wafer-map QA data (synthesise from WM-811K labels), and fab data can't leave the building (a 4B local model gets ~91% of frontier). **The rubric format doubles as an RCA eval scaffold** |

---

## 3. Anomaly detection & pre-run prediction (APC / VM / FDC)

| Source | What it says | Relevance |
|---|---|---|
| [Virtual Metrology White Paper (IRDS Metrology + Factory Integration)](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=924090) — Orji, Obeng, Beitia, Mashiro, Moyne (NIST-hosted) | Quotes the SEMI E133 VM definition; diagrams the R2R loop where VM feeds the controller alongside real metrology. Practitioner survey names the blockers: model trust, data quality, absent process-knowledge correlation, model maintenance, cost, IP security. Calls for a standardized prediction-quality metric | **The single most important document for this project.** Read it before touching FR-8 |
| [SEMI E133 — Specification for Automated Process Control Systems Interface](https://store-us.semi.org/products/e13300-semi-e133-specification-for-automated-process-control-systems-interface) | Five functional groups: R2R control, fault detection, fault classification, **fault prediction**, SPC | "Fault prediction" is our FR-8 with a standardized name. Paid standard — cite the definition, don't claim to have read the spec |
| [Graph Attention-Based Virtual Metrology for Film Deposition Processes](https://arxiv.org/abs/2606.00923) — arXiv 2606.00923 (ASU + Intel Foundry) | Temporal trace features + graph attention over process steps as nodes. Attention weights give interpretable parameter-to-layer relationships **matching known physics** | Current SOTA VM on real fab data. Warning: attention-as-explanation is already the academic answer, so our LLM layer must add more than restating weights |
| [Rare Class Prediction Model for Smart Industry in Semiconductor Manufacturing](https://arxiv.org/abs/2406.04533) — arXiv 2406.04533 | Rare failure prediction from in-situ sensors under imbalance + missingness. **AUC 0.95, precision 0.66, recall 0.96** | The honest baseline. At precision 0.66, **~1 in 3 flagged lots is a false alarm** — which is what justifies a triage/explanation layer |
| [Stability Analysis of Semiconductor Manufacturing Process with EWMA Run-to-Run Controllers](https://arxiv.org/abs/1510.08946) — arXiv 1510.08946 | Necessary and sufficient stochastic stability conditions for EWMA R2R controllers under metrology delay | **Turns our advisory-only non-goal into a rigor argument.** Any signal injected into a fab lives inside a provable stability region |
| [2025 – Machine Learning Method for Yield Management](https://www.pdf.com/resources/2025-machine-learning-method-for-yield-management/) — PDF Solutions | Fuses inline defect, metrology, e-test and equipment sensors; defect filtering → feature reduction → **XGBoost**; exposes an adjustable probability threshold for underkill/overkill | A production vendor uses gradient boosting on fused tabular features, not deep nets, and makes the **tunable threshold a product feature**. Copy both |
| [DFD — Dynamic Fault Detection](https://www.synopsys.com/content/dam/synopsys/silicon/datasheets/bistel-dfd.pdf) — BISTel (acquired by Synopsys 2021) | Legacy FDC relies only on **summary statistics** of sensor traces, so ramp-rate shifts and drift go undetected | Sets the industrial baseline honestly. Our window is trace representation + reasoning, not "add ML to FDC" |
| [FabGuard FDC](https://www.inficon.com/en/products/intelligent-manufacturing-systems/fabguard/) — INFICON | SmartFDC uses unsupervised ML to auto-detect process shifts; integrates equipment, sensor and subfab data | **Do not present Track 2 as the novelty** — this is a shipping product |
| [Tignis PAICe Maker](https://www.cohu.com/wp-content/uploads/2025/04/Tignis-PAICe-Maker-Product-Sheet-032025.pdf) — Tignis/Cohu, Mar 2025 | Physics-driven AI embedded controller; **virtual metrology built into the controller**, enabling real-time wafer-to-wafer recipe recommendations | The closest commercial match to FR-8, and it's shipped. **Position against it:** they optimize the recipe, we explain, triage and route the decision |
| [Enhancing Chip Yield Through ML-Driven Test Analytics](https://www.synopsys.com/blogs/chip-design/semiconductor-yield-analysis-machine-learning.html) — Synopsys Silicon.da | STDF + in-chip thermal/voltage/path-margin monitors streamed live; predicts VMIN, sets adaptive per-die test limits **while the wafer is still probing** | The "decide while it's still running" pattern |
| [How to best use scan diagnosis data for yield analysis](https://blogs.sw.siemens.com/tessent/2018/04/25/how-to-best-use-scan-diagnosis-data-for-yield-analysis/) — Siemens EDA | Individual diagnosis reports are ambiguous; root cause deconvolution processes many jointly. **100–200 reports** for an excursion with a dominant cause; **1,000–2,000** for mature yield with co-existing mechanisms | **The most actionable number found anywhere.** It sizes the evidence window the agent must require before asserting a cause — and warns mixed-mechanism cases need ~10× more |
| [The age of AI comes to IC test automation](https://blogs.sw.siemens.com/tessent/2024/01/18/the-age-of-ai-comes-to-ic-test-automation/) — Siemens EDA | Unsupervised ML over scan failure data; targets an additional **1–3% yield** | Honest yield-delta expectation: incremental single digits. Useful against the PRD's "1% yield drop = tens of millions" framing — that cuts both ways |

---

## 4. Root-cause analysis architecture (cross-industry precedent)

Every mature system below independently converges on the same **five-stage spine**:
**detect** (per-signal model selection) → **rank** (significance scored *separately* from detection)
→ **collect** (a fixed evidence set keyed on alert type — build this *before* any LLM) →
**attribute** (causality constrained by known domain topology) → **explain** (root cause → critical
failure → impact, every claim linked to primary evidence).

| Source | What it says | Relevance |
|---|---|---|
| [Identifying Outages with Argos, Uber Engineering's Real-Time Monitoring and Root-Cause Exploration Tool](https://www.uber.com/blog/argos-real-time-alerts/) | Dependency-aware framing: understanding service dependencies is a prerequisite to explaining *why* a metric moved | Borrowed for equipment/process-step relationships |
| [uVitals – An Anomaly Detection & Alerting System](https://www.uber.com/blog/uvitals-an-anomaly-detection-alerting-system/) | A "Seasonality Detector" picks the model per series; a **separate "Significance Scorer"** ranks anomalies so only high-impact ones page. Alerts carry deviation, contribution %, per-dimension drilldowns, ~100 sample records | **Separate detection from significance ranking.** Thousands of excursions per shift, few matter to yield. The alert payload is the evidence-bundle format to copy |
| [D3: An Automated System to Detect Data Drifts](https://www.uber.com/blog/d3-an-automated-system-to-detect-data-drifts/) | Drift detection without manual thresholds; claims 5× reduction in median detection time | Same cross-team root-causing waste we have across process/equipment teams |
| [Analyzing anomalies with ThirdEye](https://www.linkedin.com/blog/engineering/analytics/analyzing-anomalies-with-thirdeye) — LinkedIn | **Data Cube algorithm**: scores segments by change ratio, change vs the **parent node's expectation**, and contribution. Ranks whole *dimensions* before segments | **Most directly transferable algorithm here.** Our yield drop is multi-dimensional over (fab, tool, chamber, recipe, layer, lot, slot, reticle). Parent-expectation subtraction is what stops you reporting "yield dropped in Fab2" when Fab2 just runs the volume |
| [Minesweeper automates root cause analysis](https://engineering.fb.com/2021/02/09/developer-tools/minesweeper/) — Meta | Test vs control group, mining **ordered event sequences** with PrefixSpan, scoring patterns by **F1 on group separation**. ~85% accuracy | Wafer process history *is* a sequence. Failing lots as test, matched passing lots as control; "Tool A step 3 *then* Tool B" is the signal, not either alone |
| [Automated root cause analysis with Watchdog RCA](https://www.datadoghq.com/blog/datadog-watchdog-automated-root-cause-analysis/) — Datadog | Output schema: **Root Cause** (a *state change*) → **Critical Failure** (first sign in the causal chain) → **Impact**, each with sample traces | **Steal the output schema verbatim.** Restricting causes to state changes (PM event, recipe edit, part swap, new reticle) keeps candidates finite and actionable |
| [Announcing Sift](https://grafana.com/blog/announcing-sift-automated-system-checks-for-faster-incident-response-times-in-grafana-cloud/) — Grafana | Not one model: a library of **six named narrow checks** auto-triggered on incident declaration | **The cheapest thing to ship first.** Fixed named fab checks ("recipe changed in 24h", "chamber PM within window", "reticle reused after clean") with the LLM narrating over their *structured* outputs |
| [PyRCA: Making Root Cause Analysis Easy in AIOps](https://www.salesforce.com/blog/pyrca/) · [code](https://github.com/salesforce/PyRCA) | Causal graph discovery → localization. Supports **injecting domain knowledge via YAML**: root nodes, forbidden links, required edges | Key pattern for us: process flow order is a **hard DAG** — litho cannot cause a defect at a prior deposition step. Encode that as forbidden edges rather than hoping discovery rediscovers physics from noise |
| [Data in Practice: Anomaly detection for data quality at Netflix](https://www.bigeye.com/blog/data-in-practice-anomaly-detection-for-data-quality-at-netflix) | Reusable shared anomaly-detection frameworks rather than one-off scripts per pipeline | Detection layer as shared service, not per-defect-class bespoke code |

---

## 5. Agentic LLM design for diagnosis

| Source | What it says | Relevance |
|---|---|---|
| [Intelligent Assistants for the Semiconductor Failure Analysis with LLM-Based Planning Agents](https://arxiv.org/abs/2506.15567) — arXiv 2506.15567 (also ISTFA 2025, paper istfa2025p0041, pp. 41–58, [ASM](https://dl.asminternational.org/istfa/proceedings/ISTFA2025/85212/41/35162)) | Real FA labs already run many point models; the contribution is an **LLM planning agent** that orchestrates them via tool calls against external FA systems | Closest published precedent for our architecture. Validates "the models aren't the hard part, the orchestration is." **Note the title changed between versions — cite the v3 title** |
| [SemiFA: An Agentic Multi-Modal Framework for Autonomous Semiconductor Failure Analysis Report Generation](https://arxiv.org/abs/2604.13236) — arXiv 2604.13236 | DefectDescriber → RootCauseAnalyzer (fuses telemetry + vector-retrieved historical defects) → SeverityClassifier → RecipeAdvisor → PDF. SemiFA-930; 92.1% on 140 validation images; ~48s/report on an A100-40GB. **Ablation shows telemetry improves reasoning over image-only** | Near-identical decomposition. **Lift the telemetry-vs-image-only ablation** — it's exactly the experiment that proves our sensor fusion earns its complexity. Caveat: single-author, non-peer-reviewed preprint on a self-built 930-image set. Cite as related work, not as a validated benchmark |
| [Agentic Root Cause Analysis through Evidence-Grounded Reasoning](https://arxiv.org/abs/2607.22385) — arXiv 2607.22385 | **AgentRCA**: RCA with **no labeled failure examples**. Healthy-behavior models + agent tools iteratively gather evidence and **test competing hypotheses**. Matches supervised methods, emits symptom→cause explanations | Methodological spine for our reasoning layer: no-label operation (we have no root-cause ground truth), and **explicit competing-hypothesis testing** rather than single-shot explanation — which is exactly Case 6c |
| [Exploring LLM-based Agents for Root Cause Analysis](https://www.microsoft.com/en-us/research/publication/exploring-llm-based-agents-for-root-cause-analysis/) — MSR, FSE '24 | Generate-from-summary **cannot dynamically retrieve**. A ReAct agent with retrieval tools showed "highly increased factual accuracy" on real incidents. **Negative result: adding incident discussion threads gave no meaningful gain** | The direct justification for making the RCA layer agentic rather than one fixed prompt. The null result warns that piling in unstructured chatter is not free improvement |
| [Automatic Root Cause Analysis via LLMs for Cloud Incidents](https://www.microsoft.com/en-us/research/publication/automatic-root-cause-analysis-via-large-language-models-for-cloud-incidents/) — RCACopilot, EuroSys '24 | Incident → **alert-type-specific handler** → aggregate diagnostics → predict root cause **category** → narrate. Up to **0.766** accuracy. The diagnostic-collection component was in production **four years before** the LLM was added | **The best staging plan available.** Build per-signature collectors first (center → chamber pressure/flow; edge-ring → edge-bead and clamp data), classify into a **bounded category set**, then narrate. Category + narrative is measurable; free text isn't |
| [Large Language Models for Cloud Incident Management](https://www.microsoft.com/en-us/research/blog/large-language-models-for-automatic-cloud-incident-management/) — MSR, ICSE | Fine-tuning beat zero-shot by 45.5% (root cause) / 131.3% (mitigation) over 40k+ incidents. Evaluated with BLEU/ROUGE/BERTScore **plus human on-call ratings: >70% rated usefulness ≥3/5** | The **dual eval** is our credibility story: automated similarity + process-engineer usefulness ratings. The 70%-at-≥3/5 ceiling sets honest framing — triage accelerator, not autonomous decider |
| [CausalPulse: An Industrial-Grade Neurosymbolic Multi-Agent Copilot for Causal Diagnostics](https://arxiv.org/abs/2603.29755) — arXiv 2603.29755, AAAI-MAKE 2026 | Anomaly detection → causal discovery → RCA in one modular neurosymbolic architecture. 98.0% / 98.73% success, 50–60s per diagnosis. **Deployed at a Robert Bosch facility** | Our exact three-stage fusion with a production deployment behind it. The neurosymbolic split — learned detectors, symbolic causal reasoning, LLM as interface — is safer than LLM-does-causality. Also a realistic latency target (50–60s ≈ our 60s NFR) |
| [Toward Epistemic Stability: Engineering Consistent Procedures for Industrial LLM Hallucination Reduction](https://arxiv.org/abs/2603.10047) — arXiv 2603.10047 | Reframes the goal from correctness to **stability**: a system correct 95% of the time that gives a different wrong explanation each run is not deployable. Five weight-free strategies × 100 trials: Iterative Similarity Convergence 75%, Decomposed Prompting 80%, Single-Task Agent Specialization 80%, **Enhanced Data Registry 100%**, Domain Glossary Injection 77% | **Cheapest high-value finding here.** A curated, typed, authoritative data registry scored 100/100 — beating every clever prompting trick. Build the grounded evidence registry plus a fab glossary, and measure **run-to-run explanation variance** as a first-class metric |
| [Knowledge graph enhanced RAG for failure mode and effects analysis](https://arxiv.org/abs/2406.18114) — arXiv 2406.18114 | Flat RAG over FMEA sheets loses structure; contributes an FMEA schema + KG-derived embeddings | Defensible failure-mode → cause → effect → control schema, so RCA is a graph walk with provenance |
| [Fault Cause Identification through Ontology-Guided and Process-Aware FMEA Graph Learning with LLMs](https://arxiv.org/abs/2510.15428) — arXiv 2510.15428 (OGPAL) | R-GCN over a unified FMEA KG capturing semantics **and sequential process flow**; causes via link prediction. **nDCG@20 0.719 vs 0.450 for a RAG baseline** (0.559 plain R-GCN) | Hard numbers that structured graph retrieval beats plain RAG by **~60% on cause ranking**. The strongest argument for a process-flow KG — and process-awareness matters most here, since wafer RCA is inherently about ordering across hundreds of steps |
| [Agent-based Condition Monitoring Assistance with Multimodal Industrial Database RAG](https://arxiv.org/abs/2506.09247) — arXiv 2506.09247 (MindRAG) | Vector-store structures purpose-built for condition-monitoring data — signals, alarms, and **maintenance work orders used as weak supervision** for unlabeled data | The **records-as-labels** trick maps straight onto fab excursion tickets and hold logs as supervision for the lot-risk predictor |
| [Wafer Defect Root Cause Analysis with Partial Trajectory Regression](https://arxiv.org/abs/2507.20357) — arXiv 2507.20357 (IBM + NY CREATES) | Attributes defect density to upstream steps/tools via counterfactual partial trajectories; proc2vec/route2vec route embeddings. Real fab data | Explicitly **post-hoc attribution, not prediction**, by the authors' own framing. Cleanest citation for "attribution is taken; forward-looking lot risk is thinner" |
| [Cross-Process Defect Attribution using Potential Loss Analysis](https://arxiv.org/abs/2508.00895) — arXiv 2508.00895, WSC 2025 | Not an LLM paper. Reduces best-outcome identification to a **Bellman equation**, producing per-step attribution scores. Real wafer data | A quantitative tool the agent should **call**, not reimplement in prose. Also the rigorous non-LLM baseline a reviewer will demand |
| [Evaluation and Benchmarking of LLM Agents: A Survey](https://arxiv.org/abs/2507.21504) — arXiv 2507.21504 | Taxonomy: evaluation objectives (behavior, capabilities, reliability, safety) × process (interaction modes, datasets, metrics, tooling) | Pre-structures our eval chapter. Argues for evaluating the **trajectory** — tool selection, step correctness, cross-run reliability — not just the final string |
| [Building Effective AI Agents](https://www.anthropic.com/engineering/building-effective-agents) | Workflow-vs-agent distinction; orchestrator-workers pattern | Decides *where* a fixed pipeline is safer: classification = fixed workflow; root-cause reasoning = agent with tools |
| [Writing effective tools for AI agents—using AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) | Token-efficient responses, clear descriptions, evaluation-driven iteration | Shapes the 8 MCP tool schemas. Model-agnostic design discipline |
| [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Keep raw data out of the context window; pass summaries and retrieved snippets | Why raw 590-sensor time series never enter the reasoning prompt |
| [Introducing advanced tool use on the Claude Developer Platform](https://www.anthropic.com/engineering/advanced-tool-use) | On-demand tool loading rather than stuffing every definition into context up front | Relevant once this scales past one fab line |
| [Building agents with the Claude Agent SDK](https://claude.com/blog/building-agents-with-the-claude-agent-sdk) | Agent loop + tools + eval suite harness pattern | **URL corrected** — the `anthropic.com/engineering/` path now 308-redirects here |

---

## 6. Cloud & vendor platform engineering

| Source | What it says | Relevance |
|---|---|---|
| [Wafer Inspection with Machine Learning](https://docs.aws.amazon.com/reference-architecture-diagrams/latest/wafer-inspection-with-machine-learning-architecture/wafer-inspection-with-machine-learning-architecture.html) — AWS Reference Architecture | Nine-step blueprint: S3 → Lambda → SageMaker endpoint → DynamoDB → UI. **Step 9 folds engineer-reviewed images into the next training set.** Names ring/scratch as targets | Closest canonical blueprint for Track 1. The review-feeds-retraining loop is our FR-10 feedback loop, and "clean wafers bypass the human queue" is our triage |
| [Transforming Semiconductor Yield Management with AWS and Deloitte](https://aws.amazon.com/blogs/industries/transforming-semiconductor-yield-management-with-aws-and-deloitte/) | Six data families: design/simulation, equipment IoT, metrology, defect imagery, electrical test, environmental | The canonical **data-source inventory** for the fusion problem. Note it recommends Lookout for Vision — now discontinued |
| [Train custom computer vision defect detection model using Amazon SageMaker](https://aws.amazon.com/blogs/machine-learning/train-custom-computer-vision-defect-detection-model-using-amazon-sagemaker/) | A migration guide off the **discontinued Amazon Lookout for Vision**. Offers binary classification *or* semantic segmentation for pixel-level localization | Two signals: **Lookout for Vision is dead** — any design citing it is stale. And binary-vs-segmentation is the real decision, since pattern *localization* is what feeds root cause |
| [How AutoML Vision is helping companies create visual inspection solutions](https://cloud.google.com/blog/products/ai-machine-learning/ai-and-machine-learning-improve-manufacturing-visual-inspection-process) — Google Cloud | **GlobalFoundries**: AutoML Vision on wafer-map *and* SEM images, **80% first-pass accuracy** on limited data, 95% wafer validation rate, 40% cut in manual inspection. Deployed **hundreds of models** with automated data refresh | The most concrete fab-real datapoint anywhere in this list, and a genuine architectural warning: **real fabs converge on hundreds of narrow per-tool/per-layer models, not one global classifier.** 80% is the realistic baseline |
| [Visual Inspection AI](https://cloud.google.com/blog/products/ai-machine-learning/improve-manufacturing-quality-control-with-visual-inspection-ai) — Google Cloud | Multi-label, multi-instance, **localized** defect output. Claims 300× fewer labels (workable from 10–20 defective images). Runs on-prem at the edge | Sets the output bar. Few-shot matters because rare signatures — the expensive ones — never have thousands of examples |
| [Industrial AI in action: How AI agents and digital threads will transform manufacturing](https://www.microsoft.com/en-us/microsoft-cloud/blog/manufacturing/2025/03/25/industrial-ai-in-action-how-ai-agents-and-digital-threads-will-transform-the-manufacturing-industries/) — Microsoft | **Factory Operations Agent** in Azure AI Foundry → Copilot Studio → Teams, for NL querying to accelerate RCA. Husqvarna 2 → 40 factories. Stresses OT/IT/ET fragmentation as the blocker | Closest **shipped commercial analogue** to our product shape. Warns the agent is easy; the joined data layer is hard |
| [Semiconductors on the Data + AI Platform](https://www.databricks.com/blog/semiconductors-data-intelligence-platform) — Databricks | Native **STDF** handling; Unity Catalog for lineage/audit | **STDF** is the format test data actually arrives in — name it. And lineage isn't bureaucracy here: an LLM root-cause claim is only defensible if you can trace which lot, tool and recipe produced it |
| [How Modern Manufacturers Are Transforming Operations with Snowflake Intelligence](https://www.snowflake.com/en/blog/transforming-manufacturing-snowflake-intelligence/) | **Wolfspeed** consolidated 200+ silos incl. unstructured troubleshooting logs and Slack/Teams threads. Accuracy came from **semantic views, verified queries and role-based agent access** — not the LLM | Ground on a curated semantic layer with pre-verified queries, not raw text-to-SQL. And they ingest *conversational* data — **prior human reasoning is itself a retrieval corpus.** A cheap win we're currently missing |
| [What I Learned at the SEMI AI Techniques in Semiconductor Manufacturing Workshop](https://www.pdf.com/what-i-learned-at-the-semi-ai-techniques-in-semiconductor-manufacturing-workshop-and-what-it-means-for-pdf-solutions/) — PDF Solutions, Aug 2026 | Multiple presenters showed agent architectures over **manufacturing knowledge graphs**. The bottleneck is fragmented data, not volume; the field is moving "beyond detecting anomalies toward understanding the underlying drivers" | **Best single read for the architecture.** Industry consensus is knowledge-graph-under-the-agent, and anomaly detection alone is already table stakes |
| [Introducing Exensio Aurora](https://www.globenewswire.com/news-release/2026/09/09/3359050/7239/en/introducing-exensio-aurora-pdf-solutions-unveils-highly-scalable-architecture-for-exensio-analytics.html) — PDF Solutions, Sep 9 2026 | "Customized LLM-enabled agents designed to assemble full workflows," a Manufacturing Data House, model governance, **feed-forward deployment to edge/test**. Beta Sep 2026 | Direct prior art. Press release — **treat the 25× perf number as marketing**; the architecture split is the signal |
| [NVIDIA and TSMC Bring AI Into Fabs](https://nvidianews.nvidia.com/news/nvidia-and-tsmc-bring-ai-into-fabs-to-advance-semiconductor-design-and-manufacturing) — Jun 1 2026 | Metropolis/TAO for defect inspection, CUDA scheduling, Omniverse "FabTwin" | Industry validation that this is an active direction |
| [Optimizing Semiconductor Defect Classification with Generative AI and Vision Foundation Models](https://developer.nvidia.com/blog/optimizing-semiconductor-defect-classification-with-generative-ai-and-vision-foundation-models/) — NVIDIA | **93.84% → 98.51%** using 1M unlabeled + 600 labeled images (SSL + TAO) | **Figures corrected** from the plan's "94% → 98.5%". Cite precisely or it reads as invented |
| [Semiconductor Industry Accelerates Design Manufacturing With Blackwell and CUDA-X](https://blogs.nvidia.com/blog/semiconductor-industry-electronic-design-automation-blackwell-cuda-x/) — NVIDIA | cuLitho up to 25×; KLA runs GPU AI to find critical defects at inspection speed | Defect classification is already partly solved **at the inspection tool**. Our differentiation must be fusion + reasoning, not re-solving image classification |
| [Accelerating yield improvement: Root cause analysis in semiconductor manufacturing](https://www.spotfire.com/blog/2025/11/18/accelerating-yield-improvement-root-cause-analysis-in-semiconductor-manufacturing/) — Spotfire | Unifying wafer maps, process logs, defect inspections and test results into one view before root-causing | Matches our fuse-map+sensor+telemetry design. Vendor marketing content |
| [The semiconductor challenge: Navigating complexity with data-driven insights](https://www.spotfire.com/blog/2025/02/19/the-semiconductor-challenge-navigating-complexity-with-data-driven-insights/) — Spotfire | STMicroelectronics using statistical correlation (e.g. Cramér's V) to surface which process factors drive yield loss | A concrete statistical baseline to beat. Vendor marketing content |
| [AI-powered root cause analysis improves product quality](https://blogs.sw.siemens.com/partners/ai-analysis-to-find-root-cause/) — Siemens | Instrumental + Teamcenter Quality: **one-click export of a detected issue into a formal 8D investigation** with audit documentation | Pre-LLM, but states the industrial workflow contract: the deliverable is not an answer, it's a **populated, auditable quality record** |

---

## 7. IBM — Bob, watsonx, Granite

All confirmed against `bob.ibm.com/docs` and IBM newsroom, not assumed.

**IBM Bob is real.** GA announced **28 April 2026**
([newsroom](https://newsroom.ibm.com/2026-04-28-introducing-ibm-bob-ai-development-partner-that-takes-enterprises-from-ai-assisted-coding-to-production-ready-software),
[product](https://www.ibm.com/products/ai-coding-agent), [docs](https://bob.ibm.com/docs/ide)).
Both an IDE agent and a CLI (**BobShell**). Modes: **Ask** / **Plan** / **Agent**, plus an
**Advanced** mode required for Skills. **Multi-model routing across Claude, Mistral and IBM Granite**,
selected per task by accuracy/performance/cost. 80,000+ internal users, ~45% average productivity gain.

> Worth noting for PRD §0: because Bob's own routing already includes Anthropic Claude, the risk was
> never "the word Claude appears." The real risk is Bob not being load-bearing. The PRD's fix —
> watsonx.ai behind the MCP tools, Bob orchestrating — is the right architecture for the right reason.

**Config paths (this is what PLAN_REVIEW P0-1 is about):**

| What | Path |
|---|---|
| MCP registration | `.bob/mcp.json` (project, overrides global) · `~/.bob/mcp.json` (global) |
| Skills | `.bob/skills/<name>/SKILL.md` — frontmatter `name` + `description`; **no description = silently ignored** |
| Custom modes | `.bob/custom_modes.yaml` — `customModes[].slug/name/roleDefinition/whenToUse/groups/allowedSubagents` |

Transports: **stdio** (local) and **streamable-http**. Bob also supports **subagents** for parallel
workstreams, with spawns requiring explicit approval.

**Bob does not use watsonx.ai as its own backend.** watsonx.ai is something *our* MCP server calls.
Bob → MCP → our server → `ibm-watsonx-ai` SDK → Granite. That is exactly the PRD's architecture.

| Source | What it says | Relevance |
|---|---|---|
| [MCP in Bob](https://bob.ibm.com/docs/ide/configuration/mcp/mcp-in-bob) | `mcpServers` config: `command`/`args`/`cwd`/`env`/`alwaysAllow`/`disabled`; stdio + streamable-http | The authoritative wiring reference for Track 3 |
| [Skills](https://bob.ibm.com/docs/ide/features/skills) · [working example](https://github.com/IBM/bob-demo/tree/main/getting-started-skills) | `SKILL.md` + `references/`, `scripts/`; project wins over global on name collision | Write a `yieldguard` skill so Bob knows *when* to reach for the tools |
| [Custom modes](https://bob.ibm.com/docs/ide/configuration/custom-modes) | `groups`: `read`, `edit` (with `fileRegex`), `skill`, `subagent` | A "YieldGuard Engineer" mode is cheap, visible Bob integration evidence |
| [MCP integration using IBM Bob](https://www.ibm.com/think/tutorials/mcp-integration-ibm-bob) — IBM Think | Gotchas: **absolute paths** in `command`/`args`; install deps before registering; **Refresh servers** and toggle on after editing JSON; leave `alwaysAllow` empty at first | Each of these costs an hour if missed |
| [Build AI agents with IBM Bob and watsonx Orchestrate](https://developer.ibm.com/tutorials/build-agents-mcp-tools-watsonx-orchestrate-using-bob/) — Azraq, Jul 26 2026 | Confirmed to exist | Body content not extractable by fetch; read in a browser |
| [Testing watsonx Orchestrate Agents with Bob](https://heidloff.net/article/watsonx-orchestrate-skill-testing/) — Heidloff, upd. Sep 7 2026 | Bob loads a `watsonx-orchestrate` skill, drives Orchestrate via a wrapper over the **REST APIs** because the `orchestrate` CLI lacks multi-turn | Most useful worked Bob+Orchestrate example. Also warns off the CLI for conversational testing |
| [Developing watsonx Orchestrate Agents with IBM Bob](https://heidloff.net/article/bob-orchestrate/) | Two MCP servers (`wxo-docs` remote, `orchestrate-adk` local) + a custom "Agent Architect" mode | The custom-mode pattern to copy |
| [Accessing watsonx Orchestrate from Bob via CLI](https://heidloff.net/article/watsonx-orchestrate-skill-cli/) | Argues **Skill-wrapping-the-CLI beats MCP**: no server to maintain, CLI auto-updates, LLMs are good at terminal commands | A cheaper alternative pattern — but **MCP is the better story for our 8 tools**, since a judge can see the tool boundary |
| [Tools in watsonx Orchestrate via MCP, Python and OpenAPI](https://heidloff.net/article/watsonx-orchestrate-tools/) | `orchestrate toolkits import --kind mcp ... --command "node mcp-server.js --transport stdio"`; Python `@tool` from `ibm_watsonx_orchestrate.agent_builder.tools` | Copy-paste-grade. Docstrings become tool descriptions — **write them as RCA affordances** |
| [Intelligent Fab — IBM Research](https://research.ibm.com/topics/intelligent-fab) | A named IBM Research programme: aggregating "tools, equipment measurement, and sensor data"; leverages IBM's **SiView** MES | **Strategic anchor for the pitch.** IBM has an official programme for exactly this domain, and names equipment/sensor aggregation as the core challenge |
| [Understanding causal AI-based Root Cause Identification in IBM Instana](https://developer.ibm.com/articles/root-cause-identification-instana/) — Jha (IBM Research), Feb 2025 | Instana RCI = **agentic AI + causal AI + LLMs** over topology, tracing, metrics, logs and infra events | Our in-house precedent and the defensible architecture: IBM's own RCA product is causal-graph **plus** LLM, not an LLM alone. *"Same pattern as Instana RCI, applied to a fab instead of a microservice mesh."* |
| [Automatic Defect Classification for Semiconductor Manufacturing](https://research.ibm.com/publications/automatic-defect-classification-for-semiconductor-manufacturing) — IBM Research, *Machine Vision and Applications*, **1996** | Golden-template re-detection, rule-based classification. Deployed at IBM's Burlington 16M DRAM fab; 100,000+ defects; **>80% classification rate** | **Gold for the framing slide:** IBM shipped production ADC in a real fab 30 years ago at ~80% with hand-written rules. *"IBM proved the workflow in 1996; we replace the rule base with learned classification and add the root-cause step it never had."* |

### Granite models — concrete recommendations

| Model | Facts | Use |
|---|---|---|
| [`ibm-granite/granite-timeseries-ttm-r2`](https://huggingface.co/ibm-granite/granite-timeseries-ttm-r2) | **TinyTimeMixers, 805k params**, Apache 2.0, zero-shot + fine-tuned forecasting | **Strong recommendation for Track 2.** 805k params fine-tunes on a laptop in minutes, no GPU. Beats Isolation Forest on story *and* substance, and it's IBM's own model — which the "IBM technology integration" criterion rewards |
| [`granite-timeseries-patchtst-fm-r2`](https://huggingface.co/blog/ibm-research/ibm-releases-sota-granite-time-series) (IBM Research, Sep 9 2026) | ~385M params, Apache 2.0 + OpenMDW. Zero-shot forecasting, **probabilistic forecasting via a 99-quantile head**, **missing-value imputation**, 8,192-step context. 2nd overall among replicable zero-shot models on GIFT-Eval | The quantile head gives a **calibrated** anomaly band (residual outside the 99th quantile) instead of a hand-tuned threshold — and the same forecast *is* the pre-run risk signal. Imputation matters because SECOM has real sensor dropout. Cite as the production upgrade |
| [`ibm-granite/granite-4.2-30b`](https://huggingface.co/ibm-granite/granite-4.2-30b) (Aug 25 2026) | 3B/8B/30B dense, Apache 2.0. **"Reasoning-Augmented Tool Calling"**; three modes — full thinking, non-thinking, **low-effort** | The RCA reasoner. The three thinking modes are a live cost lever: low-effort to sweep all lots, full thinking for one deep dive |
| `ibm/granite-4-h-small` (watsonx.ai pay-per-token) | Current Granite on the SaaS "Provided" tier | **PRD says "Granite 3.x" — stale.** `granite-8b-code-instruct` and `granite-guardian-3-8b` are deprecated |
| [`ibm-granite/granite-vision-3.3-2b`](https://huggingface.co/ibm-granite/granite-vision-3.3-2b) | Apache 2.0, built **specifically for visual document understanding** — tables, charts, plots. Benchmarks: DocVQA, TextVQA, ChartQA | **Do not claim this classifies WM-811K patterns.** It's a document VLM. Real fit is the reporting layer: reading SPC charts and excursion reports into RCA context |

**watsonx.ai access gotchas.** SDK is `ibm-watsonx-ai` (Python ≥3.11,<3.15). You need **three** things
and the failures are confusing if any is wrong: an IBM Cloud **API key**, a **`project_id`**
(watsonx project → Manage → General), and a **region-matched URL**
(`https://us-south.ml.cloud.ibm.com`, `eu-de`, `eu-gb`, `jp-tok`, `au-syd`).

```python
from ibm_watsonx_ai import Credentials, APIClient
from ibm_watsonx_ai.foundation_models import ModelInference

client = APIClient(Credentials(url="https://us-south.ml.cloud.ibm.com", api_key="..."))
model = ModelInference(api_client=client, model_id="ibm/granite-4-h-small", project_id="...")
print(model.chat(messages=[{"role": "user", "content": "..."}]))
```

**Free tier: watsonx.ai Runtime Lite = 20 CUH + 300,000 tokens/month.** That is small. Keep
`USE_MOCK_LLM=true` as the CI default, cache real responses to disk, and spend live tokens only on the
demo and one verification pass.

---

## 8. Unverified — real content we could not confirm

Listed so nobody cites these as if read. **Read them in a browser before relying on them.**

- **KLA** (Klarity Defect, Klarity **SSA** spatial signature analysis, eSL10) — `kla.com` serves an
  IT-security block page. SSA is essentially our wafer-map pattern classifier plus wafers-at-risk
  excursion monitoring, and was the **single best-matched vendor**. Worth a manual read.
- **Applied Materials** (ExtractAI, SEMVision H20, SmartFactory E3 APC) — all 403. Snippets claim
  ExtractAI classifies the full wafer defect map after eBeam-reviewing only 0.001× of candidates — a
  striking active-learning claim, highly relevant, unverified.
- **semiengineering.com** — 403s, including "Using AI in Semiconductor Inspection" which the
  blueprint currently cites. Best fab-side reporting; verify before citing.
- **Netflix Telltale**, **Pinterest "The Quest to Understand Metric Movements"** — Medium-hosted, 403.
- **Microsoft techcommunity** — OAuth wall. Includes a Foundry Local CNC example (vision JSON →
  Phi-4-mini root-cause hypothesis) that was the most on-point item seen anywhere.
- **Wiley *Industry 4.1* AVM chapter**, **Moyne & Iskandar 2017 (*Processes* 5(3):39)**,
  **Alibaba CloudRCA (CIKM '21)** — paywalled or JS-only. The **AVM** lineage (Fan-Tien Cheng, NCKU:
  reliance index RI / global similarity index GSI / automatic model refreshing) is consistently
  described across secondary sources but no primary page was fetchable.

**Genuinely absent — plan on conference papers, not blogs:**
- **No fab publishes first-party engineering content on yield or ADC.** TSMC, Samsung, Intel,
  GlobalFoundries, Micron, Infineon, Bosch — nothing. Their work surfaces only via trade press and
  SPIE/ASMC/ISSM/IEEE TSM proceedings. The one exception is GlobalFoundries appearing as a *customer*
  in the Google Cloud post, which is why that post is unusually valuable.
- **Lam Research, ASML, Nova, yieldHUB** — no first-party technical writing found.
- **Agent tool-use benchmarks for industrial diagnosis: none exist.** All benchmark literature is
  general-domain web/API tool use.

**Corrections to the original brief:** BISTel was acquired by **Synopsys** (2021), not Onto Innovation
(Onto is Rudolph + Nanometrics). **Amazon Lookout for Vision is discontinued** — don't design against
it, even though AWS's own 2023 yield post still recommends it. **IBM Turbonomic is not an RCA tool**
(it's resource rightsizing) — lead with Instana.
