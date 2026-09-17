/* TypeScript interfaces matching the MCP tool contracts */

export interface LotMeta {
  lot_id: string;
  status: "tested" | "planned";
  yield: number | null;
  product: string;
  line: string;
  equipment: string[];
  case_id?: string;
}

export interface PipelineStatus {
  reasoning_mode: string;
  tools: Record<string, "real" | "stub">;
  real_count: number;
  stub_count: number;
  stub_reasons: Record<string, string>;
  historical_cases: number;
  known_equipment: string[];
  fixtures_loaded: number;
  lots: Record<string, LotMeta>;
}

export interface Hypothesis {
  hypothesis_id: string;
  rank: number;
  description: string;
  confidence: number;
  category?: string;
  evidence_summary: string;
  _category_source?: string;
  _confidence_uncapped?: number;
  _capped_because?: string;
}

export interface Classification {
  predicted_class: string;
  confidence: number;
  _mode?: string;
}

export interface Anomaly {
  anomaly_score: number;
  top_deviating_sensors: string[];
  _mode?: string;
  _scored_on?: string;
  _named_deviations?: Record<string, number>;
}

export interface SimilarCase {
  case_id: string;
  similarity: number;
  confirmed_root_cause: string;
  outcome: string;
  category: string;
  equipment_id?: string;
}

export interface TelemetryEntry {
  equipment_id: string;
  parameter: string;
  direction: string;
  magnitude_sigma: number;
  recent_trend: string;
}

export interface Action {
  description: string;
  priority: "high" | "medium" | "low";
  is_preventive?: boolean;
}

export interface Risk {
  at_risk: boolean;
  similarity_to_historical_low_yield: number;
  matched_case_ids: string[];
  threshold_used: number;
}

export interface ToolStep {
  tool: string;
  arg: string;
}

export interface LotData {
  lot_id: string;
  product_id: string;
  fab_line: string;
  status: string;
  equipment_ids: string[];
  final_yield_pct?: number;
  sensor_signature?: Record<string, number>;
  wafer_map_ref?: string;
  planned_process_params?: Record<string, number>;
}

export interface AnalysisResult {
  error?: string;
  lot: LotData;
  mode: "post_mortem" | "pre_run";
  steps: ToolStep[];
  classification?: Classification;
  anomaly?: Anomaly;
  cases?: { cases: SimilarCase[] };
  telemetry?: { telemetry: TelemetryEntry[]; equipment_meta?: Record<string, unknown> };
  ranked?: { hypotheses: Hypothesis[]; _mode?: string; warning?: string };
  actions?: { actions: Action[] };
  risk?: Risk;
  wafer?: number[][];
}

export interface TransparencyDataset {
  name: string;
  domain: string;
  samples: string;
  classes?: string[];
  attributes?: string;
  role: string;
}

export interface TransparencyContract {
  rule: string;
  description: string;
}

export interface TransparencyData {
  status: PipelineStatus;
  datasets: TransparencyDataset[];
  contracts: TransparencyContract[];
}

export interface EvalFixture {
  case_id: string;
  case_study: number;
  wafer_map_pattern: string;
  description: string;
  expected_category: string;
  expected_predicted_class: string;
  tests: string;
  sensor_signature?: Record<string, number>;
}

export interface EvalSummary {
  total_cases: number;
  passed: number;
  failed: number;
  pass_rate: number;
  reasoning_provider: string;
  models: {
    vision: string;
    tabular: string;
    reasoning: string;
  };
}

export interface EvalData {
  summary: EvalSummary;
  fixtures: EvalFixture[];
  live_results?: Record<string, unknown>;
}

