import type { PipelineStatus, AnalysisResult } from "./types";

const API_BASE = "";

export async function fetchStatus(): Promise<PipelineStatus> {
  const res = await fetch(`${API_BASE}/api/status`);
  if (!res.ok) throw new Error(`Status API error: ${res.status}`);
  return res.json();
}

export async function fetchAnalysis(lotId: string): Promise<AnalysisResult> {
  const res = await fetch(`${API_BASE}/api/analyze?lot=${encodeURIComponent(lotId)}`);
  if (!res.ok) throw new Error(`Analysis API error: ${res.status}`);
  return res.json();
}

export async function fetchTransparency(): Promise<import("./types").TransparencyData> {
  const res = await fetch(`${API_BASE}/api/transparency`);
  if (!res.ok) throw new Error(`Transparency API error: ${res.status}`);
  return res.json();
}

export async function fetchEval(): Promise<import("./types").EvalData> {
  const res = await fetch(`${API_BASE}/api/eval`);
  if (!res.ok) throw new Error(`Eval API error: ${res.status}`);
  return res.json();
}

