# 🚀 YieldGuard — AI Root-Cause Assistant for Semiconductor Wafer Yield

---

## 👥 Team

| Field | Value |
|---|---|
| **Team Name** | DuckDuckGo |
| **Track** | AI |
| **Team Lead** | Dhrumil Amin — 24cs005@charusat.edu.in |
| **Members** | Heet Parikh, Akshat Patel, Parva Chhatrola |

---

## 🎯 Problem Statement

When a semiconductor fab sees a yield excursion, process and yield engineers have to manually correlate wafer-map defect patterns, hundreds of equipment sensor readings, and past incident history to find the root cause. That investigation is slow, depends heavily on individual experience, and every hour of delay means more wafers are processed under the same faulty conditions.

---

## 💡 Solution

YieldGuard is an IBM Bob–driven assistant that exposes a set of MCP tools an engineer can query in plain language. It classifies wafer-map defect patterns with a CNN, scores sensor anomalies with an Isolation Forest, flags upcoming lots that resemble historical low-yield profiles, and passes that evidence to watsonx.ai to produce ranked root-cause hypotheses — each one required to cite the specific sensor, case, or telemetry parameter it is based on.

---

## ✨ Key Features

- **Industrial HMI Analyst Console (Next.js 16 + React 19):** ISA-101 compliant control room interface with dark quiet backgrounds, signal-reserved alarm colors, tabular monospace metrics, and zero-fatigue high-density layout.
- **Interactive 64×64 Wafer Map Canvas:** Pixel-level interactive silicon die inspection with real-time hover coordinate tracking `(X, Y)`, pass/defect die statistics, zoom controls (3x–6x), and spatial defect clustering.
- **Evidence-Grounded Root-Cause Reasoning (Gemini 2.0 Flash + watsonx.ai):** Ranked causal hypotheses with calibrated confidence scores. Grounded in strict contracts: every hypothesis MUST cite an empirical sensor residual, historical case, or equipment drift parameter.
- **Category Diversity & Negative Grounding:** Structured few-shot prompting prevents default-to-equipment bias across 6 failure domains (Equipment, Material, Handling, Software, Process, Measurement Artifacts).
- **Wafer-Map Defect Classification:** ResNet-style `WaferCNN` (615,801 params) trained on WM-811K across 9 defect patterns, served with 8-fold test-time augmentation over the dihedral symmetry group. Macro-F1 **0.9232** on a 9,357-map held-out split. A Vision Transformer was trained on the same split and rejected — it scored 0.6981 with 3x the parameters; see `src/models/vision/NOTES.md`.
- **Multivariate Sensor Anomaly Detection:** Variance-filtered Isolation Forest over SECOM process telemetry, selected by 8-fold cross-validation across 184 configurations and calibrated on training pass rows only. A supervised IF + gradient-boosting hybrid was also built and rejected for scoring worse; see `src/models/tabular/NOTES.md`.
- **Cleanroom Action Playbook Dispatcher:** Interactive containment checklist allowing yield engineers to toggle actions between `[PENDING]`, `[DISPATCHED]`, and `[RESOLVED]`.
- **IBM Bob + MCP Integration:** 8 contract-defined tools called by IBM Bob over stdio, with automatic fallback resolution and honest status reporting.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| **Frontend Console** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, HTML5 Canvas |
| **Backend & API** | FastAPI, Uvicorn, Python 3.10+, Model Context Protocol (MCP stdio SDK) |
| **Reasoning Providers** | **Google Gemini 2.0 Flash** (via `google-genai` SDK) & **watsonx.ai Granite** |
| **ML & Deep Learning** | PyTorch, torchvision, scikit-learn, NumPy, SciPy |
| **Agentic Orchestration** | **IBM Bob** (`.bob/skills/yieldguard`, `.bob/mcp.json`) |
| **Datasets** | WM-811K / LSWMD (811K wafer maps), SECOM (UCI ML Repository) |

---

## 📁 Repository Structure

```
├── src/
│   ├── api/                  # FastAPI backend layer proxying MCP tools (port 8787)
│   │   └── main.py
│   ├── web/                  # Next.js 16 Industrial HMI Analyst Console (port 3000)
│   │   ├── app/              # App router (Fleet monitor, Lot diagnostic, Governance, Eval)
│   │   └── lib/              # API fetchers & TypeScript interfaces
│   ├── mcp_server/           # MCP tool server exposing 8 tools to IBM Bob over stdio
│   │   ├── server.py
│   │   └── adapters.py
│   ├── reasoning/            # Root-cause reasoning backed by Gemini 2.0 Flash & Granite
│   │   └── reasoning.py
│   ├── models/
│   │   ├── vision/           # WaferViT (Vision Transformer) & WaferCNN (WM-811K)
│   │   │   └── colab/        # GPU training notebooks for Colab T4 (train_wafer_vit.ipynb)
│   │   └── tabular/          # Hybrid Isolation Forest + HistGradientBoosting (SECOM)
│   ├── contracts/            # Frozen tool input/output contracts
│   └── eval/                 # 18-case benchmark suite and test fixtures
├── docs/                     # Architecture, problem statement, and setup documentation
├── DESIGN.md                 # Design token specification conforming to ISA-101 standards
└── submission.yaml           # Structured submission metadata
```

---

## ⚡ How to Run

### Option 1: Industrial Web Console (Next.js + FastAPI)

```bash
# 1. Activate Python virtual environment and install backend deps
source .venv/bin/activate
pip install -r requirements.txt

# 2. Start the FastAPI backend engine (port 8787)
python src/api/main.py &

# 3. Start the Next.js Analyst Console (port 3000)
cd src/web && npm install && npm run dev

# 4. Open console in browser:
# http://localhost:3000
```

### Option 2: IBM Bob Agent Orchestration (MCP stdio)

```bash
# Verify the MCP server self-test passes across all 18 test fixtures:
python src/mcp_server/server.py --selftest

# Run the 18-case evaluation harness:
python src/eval/run_eval.py

# Launch IBM Bob — Bob detects .bob/mcp.json and binds the 8 YieldGuard tools automatically
bob
```

---

## 🖥️ Demo

| Artifact | Link |
|---|---|
| 📹 Demo Video | [See demo/demo-video-link.txt](demo/demo-video-link.txt) |
| 🌐 Live Demo | [See demo/live-demo-url.txt](demo/live-demo-url.txt) |
| 🖼️ Screenshots | [See demo/screenshots/](demo/screenshots/) |
| 📊 Presentation | [See presentation/slides.pdf](presentation/) |

---

## ⚠️ Known Limitations

- **Constructed pairings:** WM-811K (wafer maps) and SECOM (sensor data) are separate, unrelated public datasets. Case studies that combine the two are constructed scenarios for the demo, not real fab incidents.
- **Batch risk is a similarity proxy:** `flag_at_risk_batch` scores cosine similarity to the historical fail-class profile. A high score means "these parameters resemble past fails", not "this lot will fail". It is a triage signal, not a go/no-go gate, and the signal is thin — all 18 sub-cases land in a 0.41–0.60 band against a 0.45 threshold that sits ~0.02 above the uninformative baseline.
- **Measured performance, stated plainly:** the wafer classifier reaches **macro-F1 0.8576** on a held-out 9,357-map split; its weakest class is **Scratch at F1 0.695**, which is the class Case Study 3 depends on, and Near-full's 0.917 rests on only 22 samples. The anomaly detector reaches **recall 0.286 / precision 0.194** on the held-out SECOM fail class — it catches 6 of 21 failing lots and raises 25 false alarms. We quote macro-F1 and fail-class recall, never accuracy: "None" is 59% of the wafer split and "pass" is 93% of SECOM, so accuracy flatters a model that has learned nothing.
- **Confidence ceilings are enforced, not requested:** live Granite returned a test-head hypothesis at 0.85 and labelled it `equipment`, so its own cap never fired. The MCP server now re-derives the category from the hypothesis text and caps measurement-path claims at 0.70 and single-occurrence ones at 0.50, recording every cap on the hypothesis rather than rewriting it silently.
- **Live vs mock reasoning:** watsonx.ai Granite is wired and working. The eval scores **17/18 under mocked reasoning and 10/18 live** — the live number is the more honest one, because the mock run skips 18 assertions that canned responses cannot test. Remaining live failures are genuine: Granite favours equipment explanations over material, software and process ones. Call `pipeline_status` to see which tools are backed by trained models on any given run.
- **Simulated telemetry:** no live SECS/GEM connection. Equipment trends come from a fixed lookup.
- **Single validation split:** metrics come from one stratified held-out split with no cross-validation, so treat them as estimates.

---

## 🏅 What We're Most Proud Of

We focused on honest, evidence-grounded AI rather than confident-sounding output. Every root-cause hypothesis must name the specific sensor, case ID, or telemetry parameter behind it. The anomaly model is judged on fail-class recall and precision, never on the misleading ~93% "predict all pass" accuracy. The system is also designed to say "this may be a test-equipment artifact rather than a real defect" when the evidence points that way. A contract-first architecture (frozen tool interfaces plus shared case-study fixtures) let our team build every component in parallel and plug each one into IBM Bob without rework.

---
