# Submission Readiness — Gap Analysis

Checked against the official template guide and the `Validate Submission` Action.
Verified by inspecting the repo, not by reading the plan.

## Verdict: the validation Action is currently failing, and it's a one-file fix

**`submission.yaml` has every `# REQUIRED` field empty** — team name, track, lead name/email, all
member entries, title, problem_statement, solution_summary, all five key_features, and
`tech_stack.languages` (`[]`). The Action explicitly checks that required fields are not empty, so
the repo cannot pass validation in its current state regardless of how good the code is.

That file is also stated to be *"the first file the evaluators read."* It is currently 100% template
boilerplate. Nothing else on this list matters as much, and nothing else is as cheap to fix.

---

## Hard blockers (submission fails or scores near-zero on that criterion)

| # | Item | Status | Note |
|---|---|---|---|
| 1 | `submission.yaml` required fields | ❌ **all empty** | Action fails. Fix first |
| 2 | `docs/problem-statement.md` | ❌ template text | Checklist requires "written (not template text)". PRD §2 + §9 honesty note is the content |
| 3 | `docs/solution-overview.md` | ❌ template text | PRD §6 is the content |
| 4 | `docs/architecture.md` | ❌ template text — still shows the example React/FastAPI/PostgreSQL/Slack diagram | Replace with `docs/lld/01_architecture.mermaid` + PRD §10 component table |
| 5 | `docs/setup-guide.md` | ❌ template text | Highest-weight doc for Criterion 4 and 6. Must be tested on a clean checkout by a teammate |
| 6 | `demo/demo-video-link.txt` | ❌ placeholder URL | Listed as a "Common Mistake" by name |
| 7 | `demo/screenshots/` | ❌ 0 of 3 minimum | Only `README.md` present |
| 8 | `presentation/slides.pdf` | ❌ absent | Only `README.md` present |
| 9 | `README.md` placeholders | ⚠️ check | Search for `[` before pushing |
| 10 | Working demo exists at all | ❌ | No MCP server, no reasoning layer, models untrained — see `PLAN_REVIEW.md` P0-2 |

## Stated rule violations

| # | Item | Status | Note |
|---|---|---|---|
| 11 | `__pycache__/` committed | ❌ **9 `.pyc` files tracked** | The guide explicitly lists "Do not commit `node_modules/`, `__pycache__/`, `.venv/`, or build artefacts". `__pycache__/` *is* in `.gitignore` (line 16) — but git keeps tracking files added before the ignore rule, so they persist. Fix: `git rm -r --cached src/models/*/__pycache__` |
| 12 | `src/.env.example` completeness | ⚠️ stale | Rule: "list every environment variable your code needs". It still carries template `DATABASE_URL`/`SLACK_WEBHOOK_URL`/`APP_PORT` we don't use, and is **missing `USE_MOCK_LLM`** (Track 4's documented switch) and any vector-store path/URL |
| 13 | Repo visibility Public | ⚠️ unverified | Check on GitHub |
| 14 | `.env` not committed | ✅ | `.gitignore` line 7; nothing tracked |
| 15 | `.github/workflows/validate.yml` unmodified | ✅ | Untouched since initial commit |
| 16 | `CONTRIBUTING.md` retained | ✅ | Present |
| 17 | Top-level template structure intact | ✅ | All template dirs/files present |

## Tone / strategy risk worth five minutes

`AGENT_1`…`AGENT_5_*.md`, `TEAM_SPLIT_OVERVIEW.md` and `CONTRACTS.md` sit at the **repo top level**,
which is permitted ("Can we add extra files or directories? Yes, at the top level or inside `src/`").
But they're internal planning docs in a public, judged repo, and they contain explicit
score-optimisation language — e.g. *"the highest scoring risk in the whole project (Criterion 5, IBM
Bob Integration, 10 pts, explicitly penalizes Bob being name-dropped)"*.

PRD §12 already makes this call: *"do not paste rubric scoring into the repo verbatim."* That
instruction just wasn't applied to the agent briefs. A judge reading "how we plan to score well on
criterion 5" alongside your architecture is a worse first impression than the same content in
`docs/internal/`. Recommendation: move them to `docs/internal/` (or keep them on a planning branch)
and strip the rubric-point references. The engineering content is good — it's only the framing that
reads badly.

Note the same applies in reverse to what you *should* surface: `CONTRACTS.md` at top level is
actually decent evidence of engineering discipline for Criterion 1. Keep that one visible, just
drop the scoring commentary.

---

## Corrections to my earlier review

The guide resolves two things I flagged as uncertain, and I was wrong on both:

- **PRD §17's rubric is correct.** 6 criteria / 100 pts —
  25 Technical Implementation Quality · 25 Innovation & Differentiation · 15 Problem Depth & Vision ·
  15 Working Demo & Functionality · 10 IBM Bob Integration · 10 Documentation & Reproducibility.
  Exactly as the PRD assumed. Disregard `PLAN_REVIEW.md` P2-20's "verify which rubric applies".
- **Video is 3–5 minutes**, as the PRD said — not the 3-minute cap I suggested. `docs/case-studies.md`
  has been corrected.
- **The template repo is `drijesh-ppatel/bob-ai-hackathon-submission-template`**, organiser-designated.
  My research noted "no IBM-owned template exists, only community forks" — true but irrelevant; this
  is the official one.
- **Track: "AI"** is a valid value, as the PRD assumed.

One thing the guide *reinforces* rather than changes: **`.bob/` at the repo root is explicitly
allowed** ("Yes, at the top level"), so `PLAN_REVIEW.md` P0-1 stands — and it's now the sanctioned
place for it, not a workaround.

---

## Two rubric lines that change where effort should go

**"Evaluators read your source code — a polished README with empty `src/` will score low."**
50 of 100 points (Criteria 1 and 2) are explicitly anchored in code, not docs. Right now `src/` has
two untrained models and no pipeline. Documentation is 10 points and is nearly done; the code is 50
and is the gap. Do not spend the next block of time writing prose.

**"Partial functionality that runs scores better than complete scaffolding that doesn't."**
This is permission to cut scope, and it argues for a specific shape: **one case study working
end-to-end through Bob** beats six cases half-wired. Pick Case 1a (clean win) plus 6c (honest
ambiguity) — per PRD §13 that pairing is the strongest demo — get those two fully real, and let the
remaining sub-cases run against stubs with the eval harness reporting honestly which are which.

## Suggested order

1. **Fill `submission.yaml`** — 15 minutes, turns the Action green, unblocks nothing else but is the
   first thing read. Content is already written in the PRD (§1 title/summary, §2 problem, §6 features,
   §14 tech stack, §15 known limitations).
2. **`git rm -r --cached` the `__pycache__` dirs** — 1 minute, stated rule violation.
3. **Bob spike + stub MCP server + `.bob/mcp.json`** — the 10-point criterion and the gate everything
   else is scored through (`PLAN_REVIEW.md` P0-1, P0-2).
4. **Train the two models**, paste real numbers into both `NOTES.md`. Criteria 1 and 4.
5. **Get 1a and 6c running end-to-end**, then record the video and take the 3 screenshots from that
   run — the same session produces items 6 and 7.
6. **Adapt the four `docs/` files** from the PRD (largely mechanical — PRD §12 maps section→file) and
   build the deck from PRD §1/2/6/10/15.
