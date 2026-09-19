# 🚀 YieldGuard — Comprehensive Project Guide & Context (`start.md`)

> **IBM Bob AI Hackathon — Track: AI**  
> **Team:** DuckDuckGo  
> **Repository:** `Parva-28/bob-ai-hackathon-DuckDuckGo`  
> **Team Lead:** Dhrumil Amin (24cs005@charusat.edu.in)  
> **Members:** Heet Parikh, Akshat Patel, Parva Chhatrola  
> **Target Machine:** Windows (Local Dev Environment: `C:\Users\heet1\OneDrive\Desktop\College\IBM_DDG`)  

---

## 📌 Table of Contents
1. [Executive Summary & The Cleanroom Problem](#-1-executive-summary--the-cleanroom-problem)
2. [YieldGuard v2 Core Philosophy & Research Foundations](#-2-yieldguard-v2-core-philosophy--research-foundations)
3. [The IBM Bob MCP Orchestrator Explained (Layman's Terms)](#-3-the-ibm-bob-mcp-orchestrator-explained-laymans-terms)
4. [Complete Chronological Record of What We Built & Solved](#-4-complete-chronological-record-of-what-we-built--solved)
5. [The 9 Real MCP Tools (Zero Stubs)](#-5-the-9-real-mcp-tools-zero-stubs)
6. [Machine Learning Models & Data Provenance](#-6-machine-learning-models--data-provenance)
7. [The "One Lot Universe" (12 Registered Cleanroom Lots)](#-7-the-one-lot-universe-12-registered-cleanroom-lots)
8. [Web Console Architecture & Application Routes](#-8-web-console-architecture--application-routes)
9. [Step-by-Step Startup & Verification Guide](#-9-step-by-step-startup--verification-guide)
10. [Judge Presentation & Live Demo Playbook](#-10-judge-presentation--live-demo-playbook)
11. [Project Directory & File Structure](#-11-project-directory--file-structure)
12. [Governance, Security & Anti-Hallucination Mandates](#-12-governance-security--anti-hallucination-mandates)

---

## 🔬 1. Executive Summary & The Cleanroom Problem

### The Cleanroom Reality
In a semiconductor fabrication plant ("fab"), microchips are fabricated on 300mm silicon wafers across hundreds of chemical-mechanical, lithography, and plasma-etch processing steps. When a yield excursion occurs—such as wafer yield plunging from 95% down to 60%—fab yield and process integration engineers face an acute operational bottleneck:
1. **Spatial Defect Signatures:** Hundreds of microscopic die failures form spatial signatures (scratches, edge rings, donuts, center clusters) on 64×64 wafer maps.
2. **Sensor Overload:** Over 500 high-frequency sensor streams (RF power, chamber pressure, helium backside cooling, chuck temperature, slurry flow) generate millions of data points per run.
3. **Information Silos:** Incident logs, historical excursion archives, and preventive maintenance records reside in disconnected systems.

> **Economic Impact:** Every hour of fab downtime costs up to **$100,000+** in scrapped silicon wafers and idle EUV/plasma equipment.

### Why Standard LLM Chatbots Fail in Cleanrooms
Standard generative AI chatbots are catastrophic in semiconductor manufacturing because:
* They **hallucinate** plausible-sounding tool names, lot IDs, and sensor numbers.
* They provide **point estimates** without uncertainty bounds, giving engineers false confidence.
* They promote **automation complacency**: engineers uncritically accept AI recommendations without verifying the underlying physical physics.

### The YieldGuard Solution
**YieldGuard** is an industrial-grade, agentic AI diagnostic copilot powered by **IBM Bob** and the open standard **Model Context Protocol (MCP)**. YieldGuard replaces unconstrained chatbot guessing with a deterministic, tool-augmented, and mathematically calibrated diagnostic workflow grounded in real semiconductor datasets (WM-811K, SECOM, and PHM 2016 CMP).

---

## 🏛️ 2. YieldGuard v2 Core Philosophy & Research Foundations

YieldGuard v2 is engineered around three empirical findings from industrial manufacturing and cognitive psychology literature:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       YIELDGUARD v2 DESIGN PILLARS                          │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ 1. NIST/IRDS Thesis      │ 2. CHI 2021 Cognitive   │ 3. Zero Fabricated    │
│    Intervals > Points    │    Forcing Function      │    Data Mandate       │
│                          │                          │                       │
│ Point predictions miss   │ AI explanations alone    │ Generative AI must    │
│ 98.1% of excursions.     │ induce uncritical human  │ NEVER invent lot IDs, │
│ Conformal prediction     │ trust. The "Prior Read"  │ tool states, or fake  │
│ intervals catch >80%     │ forces engineers to form │ telemetry. Refusal to │
│ with 90% coverage.       │ hypotheses FIRST.        │ fabricate is mandatory│
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

1. **Intervals Beat Point Predictions (NIST / IRDS Roadmap):**
   * Traditional Virtual Metrology models predict single values (e.g. "removal rate = 45.2 nm/min"). In high-volume manufacturing, this catches only **1.9%** of out-of-spec wafers because sensor noise masks drift.
   * YieldGuard employs **Split-Conformal Prediction ($\alpha = 0.10$)** using Jackknife+/CV+ residual bounds, guaranteeing that 90% of genuine wafer runs fall strictly within the interval. When an interval widens or shifts beyond control limits, YieldGuard triggers a hard stop.
2. **Cognitive Forcing Function ("Prior Read" — CHI 2021 Human-AI Collaboration):**
   * Presenting AI conclusions upfront causes cognitive anchoring and uncritical rubber-stamping by operators.
   * YieldGuard introduces the **Prior Read Gate**: Before an engineer can unlock the AI's ranked root cause diagnosis and corrective action playbook, they *must* inspect the raw wafer map and telemetry, submit their own preliminary hypothesis, and record their reasoning.
3. **Zero Fabricated Data Mandate:**
   * Grounded strictly in validated cleanroom assets.
   * When queried with an unknown or unregistered lot ID (e.g., `HeET-P-4303`), YieldGuard **never fabricates synthetic context**. It immediately halts, displays a 0% confidence score, and returns an unambiguous cleanroom abstention: *"Lot Not Found in Cleanroom MES"*.

---

## 🤖 3. The IBM Bob MCP Orchestrator Explained (Layman's Terms)

### The "Hospital Chief of Medicine" Analogy
Think of IBM Bob and MCP like a **world-class hospital**:

```
                         ┌─────────────────────────────┐
                         │       THE CHIEF DOCTOR      │
                         │        (IBM Bob Agent)      │
                         └──────────────┬──────────────┘
                                        │
                         Model Context Protocol (MCP)
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           ▼                            ▼                            ▼
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │   RADIOLOGIST    │        │  LAB PATHOLOGIST │        │ MEDICAL RECORDS  │
  │   (WaferCNN)     │        │(Isolation Forest)│        │ (Vector Search)  │
  │  Classifies X-ray│        │  Analyzes blood  │        │ Finds identical  │
  │  defect patterns │        │  sensor anomalies│        │ historical cases │
  └──────────────────┘        └──────────────────┘        └──────────────────┘
```

* **The Problem with Normal LLMs:** A regular AI tries to be the doctor, radiologist, lab technician, and pharmacist all in one head—so it frequently guesses or invents plausible-sounding nonsense.
* **The IBM Bob MCP Way:** 
  1. **IBM Bob is the Chief Diagnostician.** It doesn't guess the answer.
  2. When a wafer excursion occurs, Bob opens its **MCP Medical Bag** containing 9 certified cleanroom instruments.
  3. First, Bob calls `get_lot_data` to pull the verified physical telemetry.
  4. Bob hands the wafer image to the **Radiologist** (`classify_wafer_map`), who returns: *"Edge-Ring pattern with 98.4% confidence."*
  5. Bob hands the 582 sensor channels to the **Lab Pathologist** (`score_sensor_anomaly`), who returns: *"RF forward power z-score is +3.42 sigma above baseline."*
  6. Bob checks the **Hospital Archives** (`retrieve_similar_cases`), finding: *"Case INC-2025-08-14 had the identical signature and was fixed by replacing the outer focus ring."*
  7. Only after collecting empirical evidence from all instruments does Bob synthesize the final verdict, citing exact evidence numbers.

---

## 🛠️ 4. Complete Chronological Record of What We Built & Solved

Here is the exact progression of work accomplished in our sessions:

### Phase 1: Cleanroom Hallucination Elimination ("Zero Fabricated Data")
* **The Incident:** When asked about non-existent lot `HeET-P-4303`, the assistant previously hallucinated a fictitious tool (`ETCH-02`), fake recipe parameters, and synthetic risk scores.
* **The Fix:**
  * Added strict lot extraction regex and cleanroom lot verification against the 12 registered lots in [`src/mcp_server/data/lots.json`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/src/mcp_server/data/lots.json).
  * Implemented an immediate abstention circuit in [`src/api/main.py`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/src/api/main.py) and [`YieldGuardCopilot.tsx`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/src/web/components/YieldGuardCopilot.tsx).
  * If an unknown lot is queried, the system displays a `404 Not Found / Cleanroom MES Abstention`, assigns **0% confidence**, and explicitly instructs the engineer to register the lot in MES before re-querying.
  * Updated spatial vision citations to the true held-out benchmark: **WaferCNN with TTA-8** (Macro-F1: `0.9232`, Accuracy: `0.9617`).

### Phase 2: Bob MCP Local Machine Configuration
* **The Issue:** The repository configuration `.bob/mcp.json` contained hardcoded macOS remote paths (`/Users/dhrumilamin/...`).
* **The Fix:**
  * Created and executed [`scripts/setup-bob-mcp.py`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/scripts/setup-bob-mcp.py).
  * Dynamically bound `.bob/mcp.json` to the user's active Windows Python 3.12 interpreter (`C:\Users\heet1\AppData\Local\Programs\Python\Python312\python.exe`) and local repository path (`C:\Users\heet1\OneDrive\Desktop\College\IBM_DDG\src\mcp_server\server.py`).
  * Ran the full MCP self-test suite: **18/18 test fixtures PASS with zero contract violations**.

### Phase 3: Gemini 429 Quota Exhaustion & Rate Limit Resilience
* **The Issue:** The chat copilot hit HTTP 429 `RESOURCE_EXHAUSTED` due to the deprecated `gemini-3.5-flash-lite` tier exceeding its free daily rate limit.
* **The Fix:**
  * Updated backend fallback logic to read `GEMINI_MODEL_ID` from `src/.env` (`gemini-3.5-flash`, which has healthy quota).
  * Built dual-tier fallback in `_generate_live_ai_reply`: if the cloud LLM is throttled, it cascades gracefully to grounded local structured reasoning so the cleanroom operator is never left hanging.

### Phase 4: Full Interactive "Live Pipeline Studio" (`/pipeline`)
To provide full visual transparency of the AI decision process, we built an end-to-end interactive lab:
1. **Interactive Wafer Map Canvas:**
   * HTML5 canvas rendering 64×64 silicon dies with authentic wafer circular bounding masks.
   * Coordinate HUD tracking hover position `(X, Y)` with die status (Pass / Defect).
   * Die statistics counters (Total Dies, Passing Dies, Defective Dies, Yield %).
   * Canvas zoom controls (`3x`, `4x`, `5x`).
2. **Multi-Format Image & Data Upload:**
   * Drag-and-drop / file browser supporting `.png`, `.jpg`, `.jpeg`, `.webp`, `.npy`, and `.json`.
   * Client-side offscreen canvas image processor that automatically downsamples and quantizes arbitrary user images into standard 64×64 ternary silicon bin matrices (`0 = Outside Substrate`, `1 = Passing Die`, `2 = Defective Die`).
3. **Editable Sensory Telemetry JSON Studio:**
   * Monaco-style interactive JSON editor for RF power, chamber pressure, gas flows, and temperatures.
   * 6 instant 1-click cleanroom benchmark presets (`Edge-Ring Focus Ring Erosion`, `Center Slurry Deficit`, `Donut Thermal Gradient`, `Scratch Wafer Slide`, `Nominal Baseline`, `Pre-Run Slurry Triage`).
4. **Animated 6-Stage Diagnostic Stepper:**
   * Live visual status badges and step progression across:
     - `1. Spatial Vision (WaferCNN)`
     - `2. Sensor Anomaly (Isolation Forest)`
     - `3. Historical Cases (Vector Index)`
     - `4. Fleet Telemetry (Tool Ledger)`
     - `5. Grounded Reasoning (Bayesian Root Cause)`
     - `6. Corrective Playbook (SOP Containment)`
5. **Deep MCP Wire Trace Inspector:**
   * Complete raw JSON inspection panels for every single tool invocation.
   * Real-time execution timer displaying millisecond latency (`ms`) per stage.
   * Copy-to-clipboard buttons for instant inspection and auditing.
6. **Backend Endpoints:**
   * `GET /api/pipeline/presets`: Returns verified cleanroom presets with 64×64 grids and equipment telemetry.
   * `POST /api/pipeline/run-custom`: Executes all 6 MCP stages in order and returns the structured wire trace.
7. **Navigation Integration:**
   * Added the "Pipeline Studio" item with a `Sparkles` icon to the primary sidebar navigation in [`AppShell.tsx`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/src/web/components/AppShell.tsx).

---

## ⚙️ 5. The 9 Real MCP Tools (Zero Stubs)

All 9 tools comply with the Model Context Protocol specification and execute real logic:

| # | Tool Identifier | Function & Role | Input Schema | Return Output |
|---|---|---|---|---|
| **1** | `get_lot_data` | Fetches verified lot record, wafer map, recipe parameters, and sensor readings. | `lot_id: str` | Lot metadata, tool list, sensor array, and wafer map reference. |
| **2** | `classify_wafer_map` | Runs 64×64 spatial classification across 9 benchmark defect classes with TTA-8. | `wafer_map: list[list[int]]` or `lot_id: str` | Primary pattern, secondary pattern, confidence score, defect count. |
| **3** | `score_sensor_anomaly` | Evaluates 582 process features against baseline with Isolation Forest. | `telemetry: dict` or `lot_id: str` | Anomaly score `[-1.0, 1.0]`, is_anomaly flag, top 3 deviant channels with z-scores. |
| **4** | `retrieve_similar_cases` | Cosine similarity search across 50 verified cleanroom incident cases. | `query_vector: list[float]` or `lot_id: str` | Top matching incident IDs, similarity score, historical root cause, corrective action. |
| **5** | `query_telemetry` | Queries 14-day historical fleet telemetry and maintenance logs. | `tool_id: str`, `time_window: str` | Operating hours, drift trends, last PM date, consumable wear index. |
| **6** | `rank_root_causes` | Bayesian evidence-grounded ranking of physical root causes. | `wafer_evidence`, `sensor_evidence`, `case_evidence` | Ranked causal hypotheses, calibrated confidence, explicit citations. |
| **7** | `get_corrective_action_playbook` | Generates prioritized cleanroom containment and remediation SOPs. | `root_cause_id: str`, `tool_id: str` | Immediate interlock, quarantine scope, recovery procedure, monitor wafer recipe. |
| **8** | `flag_at_risk_batch` | Pre-run recipe distance check before physical wafers enter the chamber. | `planned_lot_id: str` | Recipe delta score, predicted excursion probability, go/no-go recommendation. |
| **9** | `predict_removal_rate` | Conformal virtual metrology for CMP polishing with 90% confidence bounds. | `lot_id: str`, `run_id: str` | Conformal interval `[lower, upper]`, point estimate, abstention flag. |

---

## 🧠 6. Machine Learning Models & Data Provenance

```
                              ┌───────────────────────────────────┐
                              │     REAL SEMICONDUCTOR DATASETS   │
                              └─────────────────┬─────────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         ▼                                      ▼                                      ▼
  ┌──────────────┐                       ┌──────────────┐                       ┌──────────────┐
  │   WM-811K    │                       │    SECOM     │                       │   PHM 2016   │
  │  (LSWMD)     │                       │ (Sensors)    │                       │    (CMP)     │
  └──────┬───────┘                       └──────┬───────┘                       └──────┬───────┘
         │ 9,357 Held-Out Wafers                │ 582 In-Line Process Channels         │ Chemical Mechanical Polishing
         ▼                                      ▼                                      ▼
  ┌──────────────┐                       ┌──────────────┐                       ┌──────────────┐
  │   WaferCNN   │                       │  Isolation   │                       │  Conformal   │
  │  with TTA-8  │                       │    Forest    │                       │  Predictor   │
  └──────────────┘                       └──────────────┘                       └──────────────┘
   F1: 0.9232 (Beats ViT)                 14:1 Cost-Sensitive Weighting          90% Coverage Guarantee (α=0.10)
```

### A. Spatial Vision Model (`WaferCNN`)
* **Dataset:** Evaluated on a rigorous held-out split of **9,357 wafers** from WM-811K.
* **Why CNN Beats ViT on Wafer Maps:** Vision Transformers (ViT) were tested and achieved only **0.6981 F1** because self-attention lacks spatial translation inductive bias on sparse 64×64 binary grids. WaferCNN with deep residual convolutions achieved **0.9157 F1 (plain)** and **0.9232 F1 (with TTA-8)**.
* **Test-Time Augmentation (TTA-8):** Inference evaluates 8 symmetry-invariant transformations (0°, 90°, 180°, 270° rotations × horizontal mirror flips).
* **Per-Class Metrics (TTA-8):**
  * `Center`: **0.959 F1** | `Donut`: **0.906 F1** | `Edge-Loc`: **0.903 F1** | `Edge-Ring`: **0.984 F1**
  * `Local`: **0.834 F1** | `Random`: **0.902 F1** | `Scratch`: **0.861 F1** | `Near-full`: **0.978 F1** | `None`: **0.983 F1**

### B. Process Sensor Anomaly Model (`SECOM Isolation Forest`)
* **Dataset:** UCI SECOM semiconductor manufacturing process dataset (582 features).
* **Architecture:** Variance threshold filtering (removes invariant channels) + Isolation Forest coupled with a LightGBM hybrid score.
* **Handling Extreme Imbalance:** Cleanroom failure lots occur in only ~6% of runs. Trained with a **14:1 cost-sensitive penalty** to minimize false negatives on critical excursions.

### C. Virtual Metrology & Conformal Prediction (`PHM 2016 CMP`)
* **Dataset:** PHM 2016 Chemical Mechanical Planarization challenge dataset.
* **Statistical Framework:** Split-Conformal Prediction ($\alpha = 0.10$, 90% target coverage).
* **Abstention Metrics:**
  * **Reliability Index (RI):** Measures Euclidean distance to k-nearest training points.
  * **Geometric Similarity Index (GSI):** Measures convex hull coverage.
  * *Behavior:* If RI or GSI exceeds safety thresholds, the system flags process drift and refuses to output an ungrounded point prediction.

---

## 📦 7. The "One Lot Universe" (12 Registered Cleanroom Lots)

To prevent data hallucination, YieldGuard strictly binds to the 12 cleanroom lots registered in [`src/mcp_server/data/lots.json`](file:///c:/Users/heet1/OneDrive/Desktop/College/IBM_DDG/src/mcp_server/data/lots.json):

### Investigated Lots (Post-Excursion Root Cause Analysis)
| Lot ID | Production Line | Assigned Tools | Yield % | Spatial Pattern | Primary Physical Root Cause |
|---|---|---|---|---|---|
| **`L-4471`** | `FAB2-A` | `ETCH-07`, `CMP-03` | **61.0%** | `Edge-Ring` | Focus ring erosion; RF edge coupling non-uniformity. |
| **`L-4402`** | `FAB2-A` | `CMP-03` | **58.4%** | `Center` | Slurry dispenser nozzle partial clogging. |
| **`L-4418`** | `FAB2-A` | `CMP-03` | **64.2%** | `Center` | Retaining ring pressure drift on platen 1. |
| **`L-3310`** | `FAB1-B` | `HANDLER-04`, `ROBOT-01`| **72.1%** | `Scratch` | End-effector vacuum pad mechanical particle drag. |
| **`L-4815`** | `FAB2-A` | `LITHO-02`, `LITHO-01` | **68.5%** | `Donut` | Post-exposure bake (PEB) thermal chuck radial delta. |
| **`L-5120`** | `FAB2-C` | `ETCH-07` | **79.5%** | `Random` | Gas distribution showerhead micro-arcing. |
| **`L-5502`** | `FAB2-A` | `TESTER-04`, `CMP-03` | **8.2%** | `Near-full` | Gross de-ionized water rinse dry-out failure. |
| **`L-5540`** | `FAB1-A` | `ETCH-07`, `LITHO-02` | **88.0%** | `Edge-Ring` | Edge bead removal (EBR) solvent fluid misalignment. |

### Planned Lots (Pre-Run Predictive Triage)
| Lot ID | Production Line | Target Equipment | Status | Pre-Run Assessment |
|---|---|---|---|---|
| **`L-4502`** | `FAB2-A` | `CMP-03` | Planned | ⚠️ **HIGH RISK:** Slurry flow setpoint deficit detected. |
| **`L-4507`** | `FAB1-B` | `HANDLER-04` | Planned | ⚠️ **MODERATE RISK:** Robotic arm end-effector approaching PM cycle. |
| **`L-4511`** | `FAB2-A` | `ETCH-07` | Planned | ⚠️ **HIGH RISK:** RF forward power bias recipe mismatch. |
| **`L-4515`** | `FAB1-B` | `LITHO-02` | Planned | ✅ **NOMINAL:** All recipe parameters match gold golden run. |

---

## 🖥️ 8. Web Console Architecture & Application Routes

Built with **Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS v4**:

* **`/overview` (Command Center):** Executive fleet view, active excursion banner, real-time tool state, wafer defect clustering, and recent incident logs.
* **`/investigation` (Investigation Workspace):**
  * Interactive 64×64 wafer map die inspector with coordinate tracking `(X, Y)`.
  * **Prior Read Gate:** Forces engineer to input hypothesis before seeing AI recommendations.
  * Ranked causal hypotheses with verified citations.
* **`/pipeline` (Live Pipeline Studio):**
  * Upload custom wafer images (PNG, JPG, WebP) or `.npy` arrays.
  * Real-time editable sensory telemetry JSON editor.
  * 6 cleanroom benchmark presets with 1-click execution.
  * Live visual stepper tracking all 6 tool stages.
  * **MCP Wire Trace Inspector:** Full raw JSON arguments, output payloads, and latency (ms) for every AI/tool call.
* **`/prediction` (Virtual Metrology & Conformal Prediction):** Interactive CMP polish runs with measured removal rates against conformal bounds and abstention alerts.
* **`/batch-risk` (Pre-Run Triage):** Evaluates upcoming planned lots before wafers run.
* **`/equipment` (Fleet Telemetry):** 14-day telemetry trends and maintenance logs for all fab tools.
* **`/cases` (Incident Archive):** Searchable cleanroom incident database with root causes and corrective outcomes.
* **`/governance` & `/benchmark`:** Transparent model cards and 18-case benchmark pass/fail results.
* **Floating AI Copilot (`YieldGuardCopilot.tsx`):**
  * Accessible from any page via <kbd>Ctrl</kbd> + <kbd>J</kbd> or clicking the Bob mascot.
  * Animated Bob Mascot with speech bubble and dynamic thought steps via `ThoughtLine`.
  * Enforces the Zero Fabricated Data mandate.

---

## ⚡ 9. Step-by-Step Startup & Verification Guide

### Prerequisites
* Windows OS with PowerShell
* Python 3.10+ (Current path: `C:\Users\heet1\AppData\Local\Programs\Python\Python312\python.exe`)
* Node.js v18+ & npm

---

### Step 1: Configure Bob MCP for Your Local Machine
Run the setup script to generate `.bob/mcp.json` with absolute paths matching your directory:
```powershell
python scripts/setup-bob-mcp.py
```

### Step 2: Start the FastAPI Backend Engine (Port `8787`)
Open Terminal 1:
```powershell
python src/api/main.py
```
* **API Address:** [http://127.0.0.1:8787](http://127.0.0.1:8787)
* **Interactive Swagger Docs:** [http://127.0.0.1:8787/docs](http://127.0.0.1:8787/docs)

### Step 3: Start the Next.js Analyst Console (Port `3000`)
Open Terminal 2:
```powershell
npm --prefix src/web run dev
```
* **Web Console Address:** [http://localhost:3000](http://localhost:3000)
* Automatically proxies all `/api/*` calls to the backend on `8787`.

---

### Step 4: Verification & Automated Tests

1. **Verify MCP Server Self-Test (18 Test Fixtures):**
   ```powershell
   python src/mcp_server/server.py --selftest
   ```
   *Expected Output:* `PASS - 18 fixtures through the full chain, all contract rules held.`

2. **Verify Frontend Build:**
   ```powershell
   npm --prefix src/web run build
   ```
   *Expected Output:* Successful Turbopack compile across all 16 static routes with 0 errors.

3. **Verify API Health:**
   ```powershell
   curl http://127.0.0.1:8787/api/health
   ```

---

## 🏆 10. Judge Presentation & Live Demo Playbook

When presenting to hackathon judges, follow this **5-minute winning demonstration flow**:

```
 0:00 - 1:00          1:00 - 2:30          2:30 - 3:30          3:30 - 4:30          4:30 - 5:00
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  THE HOOK    │ ──> │ LIVE PIPELINE│ ──> │  PRIOR READ  │ ──> │  CONFORMAL   │ ──> │ COPILOT TEST │
│ $100k/hr Fab │     │   STUDIO     │     │ FORCING GATE │     │  INTERVALS   │     │ TRUTHFULNESS │
│ Excursions   │     │ (/pipeline)  │     │(/investigat.)│     │(/prediction) │     │ (Ctrl + J)   │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 1. The Hook (0:00 - 1:00)
* *"Judges, semiconductor fabs lose up to $100,000 per hour when wafer yield crashes. Generic LLMs fail here because they hallucinate fake sensors and encourage engineers to blindly accept wrong answers."*
* *"We built YieldGuard: an agentic AI diagnostic copilot powered by IBM Bob and MCP that enforces mathematical calibration, zero hallucination, and cognitive forcing."*

### 2. Live Pipeline Studio (`/pipeline`) (1:00 - 2:30)
* Navigate to `http://localhost:3000/pipeline`.
* Click **"Preset 1: Edge-Ring"**.
* Show judges the 64×64 Silicon Die Canvas: point out the die hover coordinates `(X, Y)` and yield calculation.
* Click **"Execute Cleanroom Pipeline"**:
  * Show the animated 6-stage visual stepper progressing from WaferCNN to Anomaly Detection, Vector Search, and Grounded Reasoning.
* Expand the **"MCP Wire Trace Inspector"**:
  * Show judges the raw JSON arguments and returns for each of the 6 tools.
  * Highlight the real latency in milliseconds: *"This is not a mock. Every single tool call is contract-compliant MCP executing over live code."*

### 3. Cognitive Forcing & Root Cause (`/investigation`) (2:30 - 3:30)
* Navigate to `http://localhost:3000/investigation`.
* Show the **Prior Read Gate**:
  * Point out that the AI's ranked root cause is blurred out.
  * Explain the CHI 2021 human-AI collaboration research: *"Providing AI answers immediately leads to rubber-stamping. YieldGuard forces the engineer to record their hypothesis first."*
  * Type: *"Suspect focus ring RF leakage due to edge ring defect"* and click **"Commit Prior Read"**.
  * Show the unlocked diagnosis: `Focus Ring Erosion` with 94% confidence, citing exact sensor z-scores (`RF Power +3.42σ`).

### 4. Conformal Prediction Intervals (`/prediction`) (3:30 - 4:30)
* Navigate to `http://localhost:3000/prediction`.
* Explain the NIST/IRDS thesis:
  * *"Traditional AI outputs a single number and misses 98.1% of excursions."*
  * Show the 90% conformal confidence interval bands: when process drift occurs, the bounds widen and the system abstains rather than giving a misleading point prediction.

### 5. Truthfulness & Zero Fabricated Data Test (4:30 - 5:00)
* Open the Copilot with <kbd>Ctrl</kbd> + <kbd>J</kbd> or click the Bob Mascot.
* **Test 1 (Real Lot):** Ask *"What is the status of lot L-4471?"*
  * Bob retrieves verified telemetry, wafer patterns, and the focus ring root cause.
* **Test 2 (Hallucination Probe):** Ask *"What about lot HeET-P-4303?"*
  * Bob immediately abstains: *"Lot Not Found in Cleanroom MES. Confidence: 0%."*
  * Explain to judges: *"In high-stakes semiconductor cleanrooms, refusing to fabricate is the ultimate mark of enterprise-ready AI."*

---

## 📁 11. Project Directory & File Structure

```
IBM_DDG/
├── .bob/
│   ├── mcp.json                        # Local Windows Bob MCP configuration
│   └── skills/yieldguard/SKILL.md      # Bob skill instructions and workflow rules
├── docs/
│   ├── v2/00-PLAN.md                   # YieldGuard v2 Final Round Plan & Research Thesis
│   └── architecture.md                 # System architecture specification
├── scripts/
│   └── setup-bob-mcp.py                # Setup script generating local .bob/mcp.json
├── src/
│   ├── .env                            # Environment variables (GEMINI_API_KEY, BOB_API_KEY)
│   ├── api/
│   │   └── main.py                     # FastAPI backend (MCP tool proxy, /api/pipeline/*, chat)
│   ├── eval/
│   │   ├── fixtures/                   # 18 benchmark case JSON fixtures
│   │   ├── live-results.json           # Latest evaluated benchmark results
│   │   └── run_eval.py                 # Evaluation benchmark runner
│   ├── mcp_server/
│   │   ├── adapters.py                 # Tool adapter layer (real code resolution vs stubs)
│   │   ├── provenance.py               # Explicit data provenance (MEASURED vs CONSTRUCTED)
│   │   ├── server.py                   # FastMCP server defining the 9 cleanroom tools
│   │   ├── stores.py                   # Case store, vector index, and lot database
│   │   └── data/                       # Ground-truth wafer maps (.npy) and lots.json
│   ├── models/
│   │   ├── cmp/                        # Conformal virtual metrology & abstention (Track A & B)
│   │   ├── tabular/                    # Isolation Forest multivariate anomaly detector (SECOM)
│   │   │   └── checkpoints/            # Saved .pkl models
│   │   └── vision/                     # WaferCNN ResNet-style defect classifier (WM-811K)
│   │       ├── holdout_results.json    # Official 9-class benchmark metrics (0.9232 F1)
│   │       ├── model.py                # PyTorch architecture
│   │       └── colab/train_simple.ipynb# Free GPU training notebook
│   ├── reasoning/
│   │   └── reasoning.py                # Evidence-grounded root-cause reasoning engine
│   └── web/                            # Next.js 16 Industrial HMI Analyst Console
│       ├── app/
│       │   ├── overview/page.tsx       # Command center dashboard
│       │   ├── investigation/page.tsx  # Root cause workspace with Prior Read gate
│       │   ├── pipeline/page.tsx       # Live Pipeline Studio (Upload, JSON editor, Wire Trace)
│       │   ├── prediction/page.tsx     # Conformal CMP removal rate prediction
│       │   ├── batch-risk/page.tsx     # Proactive pre-run triage
│       │   ├── equipment/page.tsx      # Fleet telemetry & maintenance logs
│       │   ├── cases/page.tsx          # Cleanroom incident archive
│       │   └── benchmark/page.tsx      # Model evaluation matrix
│       ├── components/
│       │   ├── AppShell.tsx            # Persistent ISA-101 navigation layout
│       │   ├── BobMascot.tsx           # Custom IBM Bob vector mascot with micro-animations
│       │   ├── ThoughtLine.tsx         # Streaming thought step ticker component
│       │   ├── PriorRead.tsx           # Cognitive forcing function component
│       │   └── YieldGuardCopilot.tsx   # Slide-out AI assistant drawer
│       └── lib/
│           └── api.ts                  # Client-side API fetchers and caching layer
├── start.md                            # Comprehensive project guide & context (THIS FILE)
└── submission.yaml                     # Hackathon project submission metadata
```

---

## 🔒 12. Governance, Security & Anti-Hallucination Mandates

1. **Zero Fabricated Data:** The system will never fabricate wafer defects, lot histories, or sensor parameters for unverified lots.
2. **Never Commit Secrets:** `src/.env` is gitignored. Production API keys (`GEMINI_API_KEY`, `BOB_API_KEY`, `WATSONX_API_KEY`) remain strictly local.
3. **No Large Binaries in Git:** Heavy deep learning checkpoints and large training datasets are excluded from git. Benchmark metrics are preserved in transparent, auditable JSON files (`holdout_results.json`, `live-results.json`).
4. **Strict Model Attribution:** The vision model is strictly referred to as **WaferCNN with TTA-8** (Macro-F1: 0.9232), never ViT.
5. **Calibrated Confidence Caps:** The reasoning engine enforces a hard 0.70 confidence ceiling if physical measurements conflict, and a 0.50 ceiling on isolated single events without historical precedent.
