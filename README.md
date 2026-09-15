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

- **Wafer-map defect classification:** ResNet-style CNN (~340K params) trained on WM-811K that classifies maps into 9 patterns (Center, Donut, Edge-Loc, Edge-Ring, Local, Random, Scratch, Near-full, None), using class weighting and oversampling to handle rare defect classes.
- **Sensor anomaly scoring:** Isolation Forest trained on SECOM pass-class lots that returns a 0–1 anomaly score plus the top 5 most deviating sensors.
- **At-risk batch flagging:** Compares an incoming lot's planned process parameters against the historical fail-class sensor profile and flags lots that look like past low-yield runs, for engineer triage.
- **Evidence-grounded root-cause ranking (watsonx.ai):** Ranked hypotheses with confidence scores, where every hypothesis must name its evidence source, and a corrective-action playbook for the top hypothesis.
- **IBM Bob + MCP integration:** Eight contract-defined tools (`classify_wafer_map`, `score_sensor_anomaly`, `flag_at_risk_batch`, `retrieve_similar_cases`, `query_telemetry`, `rank_root_causes`, `get_corrective_action_playbook`, `submit_feedback`) that Bob calls based on how the engineer phrases the question.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| **Languages** | Python |
| **Frameworks** | PyTorch, torchvision, scikit-learn, pandas, NumPy, SciPy |
| **IBM Technologies** | IBM Bob (MCP server integration), watsonx.ai (Granite models) |
| **Databases** | Vector store for similar-case retrieval (Qdrant / Chroma) |
| **Other** | Model Context Protocol (MCP), GitHub Actions, Kaggle (WM-811K), UCI ML Repository (SECOM) |

---

## 📁 Repository Structure

```
├── src/                      # All source code
│   ├── contracts/            # Frozen tool input/output contracts
│   ├── eval/fixtures/        # Case-study fixtures used for self-tests
│   └── models/
│       ├── vision/           # Wafer-map CNN classifier (WM-811K)
│       └── tabular/          # Sensor anomaly + batch-risk models (SECOM)
├── docs/                     # Written documentation
│   ├── problem-statement.md
│   ├── solution-overview.md
│   ├── architecture.md
│   └── setup-guide.md
├── demo/                     # Demo artifacts
│   ├── screenshots/          # App screenshots
│   └── demo-video-link.txt   # Link to demo video
├── presentation/             # Slide deck
├── requirements-vision.txt   # Dependencies for the vision track
├── requirements-tabular.txt  # Dependencies for the tabular track
└── submission.yaml           # Structured submission metadata
```

---

## ⚡ How to Run

```bash
# 1. Clone the repo
git clone https://github.com/Parva-28/bob-ai-hackathon-Mazaaaa.git
cd bob-ai-hackathon-Mazaaaa

# 2. Install dependencies (Python 3.10+ recommended)
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-vision.txt -r requirements-tabular.txt

# 3. Configure environment (needed for watsonx.ai)
cp src/.env.example .env
# Edit .env with your WATSONX_API_KEY, WATSONX_PROJECT_ID and WATSONX_URL

# 4a. Vision track — wafer-map classifier
kaggle datasets download -d qingyi/wm811k-wafer-map   # place LSWMD.pkl in src/models/vision/data/
python src/models/vision/data_prep.py --pkl src/models/vision/data/LSWMD.pkl
python src/models/vision/train.py
python src/models/vision/test_classifier.py

# 4b. Tabular track — sensor anomaly & batch risk (SECOM is fetched via ucimlrepo)
python src/models/tabular/data_prep.py
python src/models/tabular/train.py
python src/models/tabular/test_anomaly.py
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
- **Batch risk is a similarity proxy:** `flag_at_risk_batch` uses cosine similarity to the historical fail-class profile. A high score means "these parameters resemble past fails", not "this lot will fail". It is a triage signal for engineers, and the 0.60 threshold is untuned.
- **Rare classes and subtle fails:** Donut and Near-full wafer patterns have very few training samples and are expected to score lower. Fail lots whose sensor deviations look like measurement noise will be missed by any unsupervised model.
- **Integration still in progress:** The vision and tabular models are implemented in this repo. The MCP server, the watsonx.ai reasoning module, the vector-store case retrieval and the simulated SECS/GEM telemetry are specified in [`CONTRACTS.md`](CONTRACTS.md) but not yet merged.
- **Single validation split:** Metrics come from one stratified held-out split with no cross-validation, so treat them as estimates.

---

## 🏅 What We're Most Proud Of

We focused on honest, evidence-grounded AI rather than confident-sounding output. Every root-cause hypothesis must name the specific sensor, case ID, or telemetry parameter behind it. The anomaly model is judged on fail-class recall and precision, never on the misleading ~93% "predict all pass" accuracy. The system is also designed to say "this may be a test-equipment artifact rather than a real defect" when the evidence points that way. A contract-first architecture (frozen tool interfaces plus shared case-study fixtures) let our team build every component in parallel and plug each one into IBM Bob without rework.

---
