# YieldGuard — Pitch Deck Content Plan (4 core slides + 3 optional)

> Design brief: flowchart-heavy, low text. Every slide below lists (a) the only
> words that should appear on the slide, (b) the diagram/flowchart to draw, and
> (c) the exact image/screenshot to capture and where from. Speaker notes carry
> the detail — the slide itself should be readable in 3 seconds.

---

## Slide 1 — Team Intro

**On-slide text (minimal):**
- Project name + one-line tagline: **"YieldGuard — Zero-Fabrication AI for Semiconductor Yield"**
- Team name: **DuckDuckGo**
- 4 names + 1-word role each:
  - Dhrumil Amin — Team Lead
  - Heet Parikh — [your role, e.g. Full-Stack / Integration]
  - Akshat Patel — [role]
  - Parva Chhatrola — [role]
- Track: IBM Bob AI Hackathon — Track: AI

**Diagram:** none needed — this is a clean title/roster slide. Optional: 4 small circular headshot placeholders in a row with name + role under each.

**Images to include:**
- Team photo (if you have one) or 4 individual headshots.
- IBM Bob / hackathon logo, small, corner placement.
- Your own YieldGuard logo/wordmark if you have one (the "Y" mark used in the web app sidebar works — screenshot it from `AppShell.tsx`'s brand mark, top-left of any page).

---

## Slide 2 — Problem Statement & Solution

**On-slide text (minimal — two columns, "Problem" | "Solution"):**

Problem column (3 short lines max):
- Fab yield excursions cost **$100K+/hour**
- Root cause hides across **wafer maps + 500+ sensors + incident history**
- Generic AI chatbots **hallucinate** — fake tool names, fake sensors, false confidence

Solution column (3 short lines max):
- **YieldGuard**: agentic copilot on **IBM Bob + MCP**
- Every answer is **tool-grounded**, cites real evidence
- **Refuses to fabricate** — unknown lot → honest "not found," not a guess

**Diagram:** Simple before/after flow, left to right:
```
[Engineer asks a question]
        |
   ┌────┴────┐
   ▼         ▼
[Generic AI]   [YieldGuard]
  guesses        calls real
  confidently     MCP tools
     ✗              ✓
```
Or even simpler: a red "✗ Hallucinated Answer" box vs a green "✓ Evidence-Cited Answer" box, both fed by the same question, to make the contrast instant.

**Images to include:**
- A screenshot of a real wafer bin-map (the canvas render from `/pipeline`, e.g. the Edge-Ring preset) — this single image does a lot of work explaining "what does yield failure even look like."
- Optional: a stock/simple icon for "$100K/hour" (a burning-money or clock icon) — keep it as an icon, not a paragraph.

---

## Slide 3 — Architecture

**On-slide text: NONE beyond a title.** This slide should be almost 100% diagram.

**Diagram (the centerpiece of the whole deck) — recommend this exact flow, left to right or top to bottom:**

```
 Engineer / Judge
        │
        ▼
 ┌─────────────────┐
 │   IBM Bob        │   ← orchestrator, decides which tool to call
 │  (MCP Client)     │
 └────────┬─────────┘
          │  Model Context Protocol
          ▼
 ┌───────────────────────────────────────────────────────────┐
 │                   YieldGuard MCP Server                     │
 │                                                              │
 │  get_lot_data → classify_wafer_map → score_sensor_anomaly    │
 │       → retrieve_similar_cases → query_telemetry             │
 │       → rank_root_causes → get_corrective_action_playbook    │
 └───────────────┬───────────────┬───────────────┬─────────────┘
                 ▼                ▼                ▼
         ┌───────────────┐ ┌──────────────┐ ┌──────────────────┐
         │  WaferCNN      │ │ Isolation    │ │ Case Vector Store│
         │  (Vision, real │ │ Forest        │ │ + Conformal CMP│
         │  trained model)│ │ (Anomaly)     │ │ Predictor      |
         └───────────────┘ └──────────────┘ └──────────────────┘
```

This is literally your real tool chain — use the "Hospital Chief of Medicine" framing verbally (Bob = chief doctor, tools = radiologist/lab/records) but keep the SLIDE to boxes and arrows only, no analogy text on-screen.

**Images to include:**
- Best option: **recreate this diagram cleanly in Figma/PowerPoint SmartArt/draw.io** rather than screenshotting anything — it'll look sharper than a code screenshot.
- If time is short: a screenshot of the **Pipeline Studio's "Wire trace" tab** (the `/pipeline` page, "Wire trace" tab after running once) makes a great supporting visual on this slide or the next — it shows the exact same 6-tool sequence actually executing with real latencies, which doubles as proof the architecture slide isn't just theoretical.

---

## Slide 4 — Let's Jump to Live Demo

**On-slide text (minimal):**
- Big centered text: **"Let's see it live."**
- 3 small icons/labels beneath, left to right, representing what you'll show in order:
  1. **Upload / Live Matrix** — icon: upload arrow
  2. **6-Tool Pipeline Runs** — icon: gears/chain-link
  3. **Evidence-Grounded Verdict** — icon: checkmark/shield

**Diagram:** none — this is a transition slide, meant to be on-screen for ~5 seconds while you alt-tab into the actual running app. Keep it visually calm so it doesn't compete with the live demo that follows.

**Images to include:** none required. Optional: a single blurred/dimmed screenshot of the Pipeline Studio in the background behind the text, so the transition into the real app feels seamless.

**Demo script reminder (speaker notes, not on slide):**
1. Click a preset (e.g. Edge-Ring) → point out the real wafer canvas.
2. Click **Run pipeline** → narrate each of the 6 stage cards appearing live.
3. Point out the confidence % and the reasoning narrative / evidence citations.
4. Optional wow-moment: click **Live matrix**, paste one of the `demo-matrices/*.json` arrays (never seen by the model before), and classify it live.
5. Ask the copilot about an unknown lot ID to show the honest refusal-to-fabricate behavior.

---

## Optional Slides (add 2-3 of these only if you have time left)

### Optional A — "Why It's Trustworthy" (differentiators)
**On-slide text:** 3 short claims, each with a number:
- **90% conformal coverage** — intervals, not fake-precise point guesses
- **Cognitive-forcing workflow** — engineer commits a hypothesis before seeing the AI's
- **Zero fabricated data** — unknown lot → refuses, doesn't invent

**Diagram:** 3 icon-badges in a row (shield / lock / brain), each with its one-line claim underneath — no paragraphs.
**Images:** none needed; icons only.

### Optional B — "Real Models, Not Mockups" (proof slide)
**On-slide text:** just the model names + one real metric each:
- WaferCNN — Macro-F1 **0.9232**
- Isolation Forest — trained on real SECOM data
- Conformal CMP Predictor — **90%** target coverage

**Diagram/Image:** screenshot of the class-probability bar chart from `/pipeline`'s Vision card (proves it's a real softmax distribution, not a canned number) — this is a strong visual since it's numbers a judge can sanity-check live.

### Optional C — "What's Next" (roadmap, closing slide)
**On-slide text:** 3 bullet phrases max, e.g.:
- Live watsonx/Gemini reasoning in production
- Multi-fab deployment
- Real MES integration

**Diagram:** simple left-to-right arrow timeline: `Today → Next → Vision`.
**Images:** none needed.

---

## General slide-design notes

- **One idea per slide.** If a slide needs more than ~15 words total (excluding labels inside a diagram), cut it.
- **Every diagram above should be redrawn cleanly** (Figma, PowerPoint SmartArt, excalidraw, or draw.io) rather than pasted as a code block or screenshot of this file.
- **Reuse the app's own color language** for visual consistency with the live demo: navy `#274c6b`, red `#b5473f` (defect/danger), green `#2e6e58` (pass/good), amber `#b8852c` (warning) — so the deck and the live app feel like one product when you switch between them.
- Keep the **font consistent with the app** if possible: headers in "Space Grotesk," body/labels in "IBM Plex Mono" — both are already loaded in the web app and reinforce the same visual identity live.
