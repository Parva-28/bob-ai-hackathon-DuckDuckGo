---
version: 1.0.0
name: YieldGuard Industrial HMI
description: High-density mission-critical semiconductor fabrication yield analysis console based on ISA-101 HMI guidelines.
colors:
  primary: "#00d2b4"
  secondary: "#10b981"
  surface: "#0f1724"
  surface-sunken: "#0a0f1a"
  panel: "#131d2e"
  panel-hover: "#182438"
  border: "#1e2c42"
  text: "#d1d9e6"
  text-dim: "#8292a8"
  text-dimmer: "#4d5b70"
  alarm-critical: "#ef4444"
  alarm-critical-dim: "#7f1d1d"
  alarm-warning: "#f59e0b"
  alarm-warning-dim: "#78350f"
  status-nominal: "#10b981"
  status-nominal-dim: "#064e3b"
  info-accent: "#38bdf8"
typography:
  headline-display:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.05em
  body-md:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 11px
    fontWeight: 400
    lineHeight: 1.4
  label-caps:
    fontFamily: Inter, -apple-system, sans-serif
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: 0.12em
  data-mono:
    fontFamily: "JetBrains Mono", Menlo, Consolas, monospace
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
rounded:
  none: 0px
  sm: 2px
  md: 2px
  lg: 4px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
components:
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: 16px
  status-pill:
    rounded: "{rounded.sm}"
    padding: 4px 8px
    fontSize: 10px
---

# YieldGuard Industrial HMI Design Specification

## Overview
YieldGuard is an industrial semiconductor fab yield diagnostic and root-cause analysis console. The design follows ISA-101 Human-Machine Interface (HMI) standards for control rooms and cleanroom yield analytics.
It is engineered for high situational awareness, zero visual fatigue during 12-hour shifts, and instantaneous pattern recognition.

## Colors
- **Surface Sunken (`#0a0f1a`)**: Base background canvas, low-luminance deep obsidian.
- **Surface (`#0f1724`)**: Elevated workspaces and header bands.
- **Panel (`#131d2e`)**: High-contrast container panels with razor-sharp 1px border delineation.
- **Border (`#1e2c42`)**: Structural grid lines without rounded visual fluff.
- **Primary Teal (`#00d2b4`)**: Active selection, interactive triggers, radar traces.
- **Signal-Reserved Alarms**:
  - **Alarm Critical (`#ef4444`)**: Yield drop anomalies (<75% yield), equipment drift failure.
  - **Alarm Warning (`#f59e0b`)**: Moderate variance (75-85% yield), planned batch risks.
  - **Status Nominal (`#10b981`)**: Nominal run (≥85% yield), verified parameters.

## Typography
- Typography pairs clean **Inter** with tabular **JetBrains Mono** numerals for sensory telemetry and spatial wafer coordinates.
- All metrics enforce `tabular-nums` for rock-solid stability during live telemetry feeds.
- High-density uppercase tracking (`letterSpacing: 0.12em`) distinguishes industrial hardware descriptors from conversational AI insights.

## Layout
- Split asymmetric viewport: Left persistent navigation & lot telemetry rack (240px fixed), primary workspace flexible viewport.
- 100% stacked evidentiary cards: Wafer spatial canvas, high-dimensional sensor deviations, causal hypothesis hierarchy, and dispatch playbooks.
- Strict 8-point density grid with 1px border separations.

## Elevation & Depth
- **Zero fuzzy drop-shadows.** Industrial HMIs avoid diffuse lighting.
- Contrast is achieved via **1px hard tonal borders (`#1e2c42`)** and dual-tier panel elevation (`#0f1724` over `#0a0f1a`).
- Active and focus states utilize high-visibility 2px accent bars (`#00d2b4`).

## Shapes
- **Sharp, clinical geometry (0px to 2px radii).** Rounded 8px/16px "friendly SaaS" curves are strictly avoided. Every panel, button, badge, and canvas container communicates precision engineering.

## Components
- **Wafer Canvas**: 64×64 pixel-dense silicon die matrix with color-coded defect dies and interactive coordinate tooltips.
- **Hypothesis Card**: Evidence-ranked causal card featuring numerical confidence bars, categorical tags, and verified citations.
- **Telemetry Sparkline**: High-frequency sensor deviation tables with z-score anomaly indicators.
- **Action Playbook**: Direct cleanroom dispatch checklist with equipment containment steps.

## Do's and Don'ts
- **DO** reserve high-saturation red and amber strictly for true yield anomalies and hardware alarms.
- **DO** use monospace numerals for all lot IDs, dates, yields, and sensor values.
- **DON'T** use purple, indigo, or ambient neon gradients.
- **DON'T** use soft, blurry cards or generic floating bento-box layouts.
