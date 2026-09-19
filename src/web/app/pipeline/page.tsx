"use client";

import { useState, useEffect, useRef, useMemo, ChangeEvent, DragEvent } from "react";
import AppShell from "@/components/AppShell";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Cpu,
  Crosshair,
  Database,
  Download,
  Eye,
  FileCode,
  FileText,
  HelpCircle,
  Layers,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Upload,
  Wrench,
  Zap,
} from "lucide-react";

interface PipelineStep {
  step_number: number;
  tool_name: string;
  category: string;
  model: string;
  input_payload: any;
  output_payload: any;
  execution_ms: number;
  status: string;
  summary: string;
}

interface PipelineResult {
  lot_id: string;
  product_id: string;
  fab_line: string;
  equipment_ids: string[];
  wafer_grid: number[][];
  classification: {
    predicted_class: string;
    confidence: number;
    class_probabilities: Record<string, number>;
    defect_dies: number;
    total_dies: number;
    defect_density_pct: number;
    model: string;
  };
  anomaly: {
    anomaly_score: number;
    top_deviating_sensors: string[];
  };
  cases: {
    cases: Array<{
      case_id: string;
      similarity: number;
      confirmed_root_cause: string;
      outcome: string;
      category: string;
      equipment_id: string;
    }>;
  };
  telemetry: {
    telemetry: any[];
  };
  ranked: {
    hypotheses: Array<{
      category: string;
      confidence: number;
      description: string;
      evidence_summary: string;
      supporting_evidence: string[];
    }>;
  };
  actions: {
    actions: string[];
  };
  steps: PipelineStep[];
  total_execution_ms: number;
  timestamp: string;
}

interface PresetItem {
  id: string;
  name: string;
  case_id: string;
  lot_id: string;
  expected_class: string;
  product_id: string;
  fab_line: string;
  equipment_ids: string[];
  sensor_data: Record<string, number>;
  description: string;
  wafer_grid: number[][];
}

const CLASS_COLORS: Record<string, string> = {
  "Edge-Ring": "#ef4444",
  Center: "#f97316",
  Scratch: "#eab308",
  Donut: "#8b5cf6",
  Random: "#ec4899",
  "Near-full": "#dc2626",
  "Edge-Loc": "#06b6d4",
  Local: "#3b82f6",
  None: "#10b981",
};

export default function PipelineStudioPage() {
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("preset-edge-ring");
  const [activeTab, setActiveTab] = useState<"visual" | "trace" | "matrix">("visual");

  // Inputs
  const [lotId, setLotId] = useState("L-4471");
  const [equipmentText, setEquipmentText] = useState("ETCH-07, CMP-03");
  const [sensorJson, setSensorJson] = useState(`{
  "sensor_23": 3.42,
  "sensor_24": 2.88,
  "rf_power_target_w": 1750.0,
  "chamber_pressure_mt": 82.0,
  "he_cooling_sccm": 12.4
}`);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Wafer Canvas
  const [waferGrid, setWaferGrid] = useState<number[][]>(() =>
    Array(64).fill(0).map(() => Array(64).fill(0))
  );
  const [canvasZoom, setCanvasZoom] = useState<number>(4);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; val: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pipeline Execution State
  const [isRunning, setIsRunning] = useState(false);
  const [activeRunningStep, setActiveRunningStep] = useState<number>(0);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Load Presets
  useEffect(() => {
    fetch("/api/pipeline/presets")
      .then((res) => res.json())
      .then((data) => {
        if (data.presets && data.presets.length > 0) {
          setPresets(data.presets);
          const first = data.presets[0];
          applyPreset(first);
        }
      })
      .catch((err) => console.error("Error loading presets:", err));
  }, []);

  const applyPreset = (preset: PresetItem) => {
    setSelectedPresetId(preset.id);
    setLotId(preset.lot_id);
    setEquipmentText(preset.equipment_ids.join(", "));
    setSensorJson(JSON.stringify(preset.sensor_data, null, 2));
    setJsonError(null);
    if (preset.wafer_grid && preset.wafer_grid.length === 64) {
      setWaferGrid(preset.wafer_grid);
    }
  };

  // Render Wafer Map on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cellSize = canvasZoom;
    canvas.width = 64 * cellSize;
    canvas.height = 64 * cellSize;

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = 31.5 * cellSize;
    const centerY = 31.5 * cellSize;
    const radius = 30.5 * cellSize;

    // Draw wafer substrate circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw Notch at bottom (standard 300mm wafer alignment notch)
    ctx.beginPath();
    ctx.arc(centerX, centerY + radius - 2, 4 * (canvasZoom / 4), 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    // Draw Dies
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 64; c++) {
        const val = waferGrid[r]?.[c] ?? 0;
        if (val === 0) continue; // Outside wafer circle

        const x = c * cellSize;
        const y = r * cellSize;

        if (val === 1) {
          // Passing die
          ctx.fillStyle = "#10b981";
        } else if (val === 2) {
          // Defective die
          ctx.fillStyle = "#ef4444";
        }

        ctx.fillRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
      }
    }
  }, [waferGrid, canvasZoom]);

  // Handle Canvas Mouse Move
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / canvasZoom);
    const y = Math.floor((e.clientY - rect.top) / canvasZoom);

    if (x >= 0 && x < 64 && y >= 0 && y < 64) {
      const val = waferGrid[y]?.[x] ?? 0;
      setHoverCoord({ x, y, val });
    } else {
      setHoverCoord(null);
    }
  };

  // Drag & Drop Image Handling
  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();

    if (file.name.endsWith(".json")) {
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed) && parsed.length === 64) {
            setWaferGrid(parsed);
          } else if (parsed.wafer_grid) {
            setWaferGrid(parsed.wafer_grid);
          } else if (typeof parsed === "object") {
            setSensorJson(JSON.stringify(parsed, null, 2));
          }
        } catch {
          alert("Invalid JSON file uploaded.");
        }
      };
      reader.readAsText(file);
      return;
    }

    // Handle Image file (PNG, JPG, WebP)
    if (file.type.startsWith("image/")) {
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const offCanvas = document.createElement("canvas");
          offCanvas.width = 64;
          offCanvas.height = 64;
          const ctx = offCanvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 64, 64);
          const imgData = ctx.getImageData(0, 0, 64, 64).data;

          const newGrid: number[][] = Array(64).fill(0).map(() => Array(64).fill(0));
          const cx = 31.5;
          const cy = 31.5;
          const rMax = 30.5;

          for (let r = 0; r < 64; r++) {
            for (let c = 0; c < 64; c++) {
              const dist = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
              if (dist > rMax) {
                newGrid[r][c] = 0;
                continue;
              }
              const idx = (r * 64 + c) * 4;
              const red = imgData[idx];
              const green = imgData[idx + 1];
              const blue = imgData[idx + 2];
              const brightness = (red + green + blue) / 3;

              // If reddish or significantly darker/lighter than baseline
              if (red > green + 30 && red > blue + 30) {
                newGrid[r][c] = 2; // Defect die
              } else if (brightness > 180 || (red > 100 && green > 100 && blue > 100)) {
                newGrid[r][c] = 2; // Defect die
              } else {
                newGrid[r][c] = 1; // Passing die
              }
            }
          }
          setWaferGrid(newGrid);
          setSelectedPresetId("custom-upload");
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Run Pipeline Execution
  const runFullPipeline = async () => {
    let parsedSensors = {};
    try {
      parsedSensors = JSON.parse(sensorJson);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message || "Invalid JSON syntax");
      return;
    }

    setIsRunning(true);
    setActiveRunningStep(1);
    setPipelineResult(null);

    const payload = {
      lot_id: lotId.trim() || "LOT-CUSTOM-01",
      product_id: "P-LOGIC-3N",
      fab_line: "FAB2-A",
      equipment_ids: equipmentText.split(",").map((s) => s.trim()).filter(Boolean),
      case_id: selectedPresetId.startsWith("preset-")
        ? presets.find((p) => p.id === selectedPresetId)?.case_id
        : null,
      wafer_grid: waferGrid,
      sensor_data: parsedSensors,
    };

    // Stagger step animation to show each AI tool firing
    const timer = setInterval(() => {
      setActiveRunningStep((prev) => (prev < 6 ? prev + 1 : prev));
    }, 280);

    try {
      const res = await fetch("/api/pipeline/run-custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      clearInterval(timer);
      setActiveRunningStep(6);
      setTimeout(() => {
        setPipelineResult(data);
        setIsRunning(false);
      }, 400);
    } catch (err) {
      clearInterval(timer);
      setIsRunning(false);
      alert("Failed to execute pipeline: " + err);
    }
  };

  const copyStepJson = (stepNum: number, content: any) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopiedStep(stepNum);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  // Die statistics
  const dieStats = useMemo(() => {
    let total = 0;
    let defect = 0;
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 64; c++) {
        if (waferGrid[r][c] > 0) total++;
        if (waferGrid[r][c] === 2) defect++;
      }
    }
    return {
      total,
      defect,
      density: total > 0 ? ((defect / total) * 100).toFixed(2) : "0.00",
    };
  }, [waferGrid]);

  return (
    <AppShell activeLotId={lotId}>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <Sparkles className="w-3.5 h-3.5" />
                Live Tool Orchestration
              </span>
              <span className="text-xs font-mono text-muted-foreground">MCP Server: 9 Tools Online</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-space">
              Interactive Diagnostic Pipeline Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Upload custom wafer maps, supply lot sensor JSON, and observe every AI model and MCP tool call execute live in real time.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={runFullPipeline}
              disabled={isRunning}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-sm shadow-sm transition-all disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Executing Tool {activeRunningStep}/6…
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Run Full Diagnostic Pipeline
                </>
              )}
            </button>
          </div>
        </div>

        {/* Cleanroom Presets Bar */}
        <div className="bg-card border border-border rounded-xl p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Benchmark Cleanroom Presets (1-Click Load)
            </span>
            <span className="text-xs text-muted-foreground font-mono">6 Real Fab Scenarios</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {presets.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              const color = CLASS_COLORS[preset.expected_class] || "#3b82f6";
              return (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={`p-2.5 rounded-lg text-left border transition-all ${
                    isSelected
                      ? "bg-blue-50/60 border-blue-400 shadow-xs ring-1 ring-blue-400"
                      : "bg-background hover:bg-muted/50 border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white"
                      style={{ backgroundColor: color }}
                    >
                      {preset.expected_class}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground font-medium">
                      {preset.lot_id}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-foreground truncate" title={preset.name}>
                    {preset.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {preset.equipment_ids.join(" • ")}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Studio Workspace: Left (Inputs) | Right (Execution Trace & Results) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── Left Column: Inputs & Canvas (5 cols) ── */}
          <div className="lg:col-span-5 space-y-5">
            {/* Wafer Map Section */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Eye className="w-4 h-4 text-blue-600" />
                  Wafer Map Inspection (64×64 Grid)
                </h2>
                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  <span>Zoom:</span>
                  {[3, 4, 5].map((z) => (
                    <button
                      key={z}
                      onClick={() => setCanvasZoom(z)}
                      className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
                        canvasZoom === z ? "bg-primary text-white" : "bg-muted hover:bg-border"
                      }`}
                    >
                      {z}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Interactive Canvas */}
              <div className="flex flex-col items-center justify-center p-3 bg-slate-950 rounded-lg border border-slate-800">
                <canvas
                  ref={canvasRef}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => setHoverCoord(null)}
                  className="rounded cursor-crosshair shadow-inner max-w-full"
                />

                {/* Canvas Status Line */}
                <div className="w-full flex items-center justify-between text-[11px] font-mono text-slate-400 mt-2.5 px-1 border-t border-slate-800 pt-2">
                  <div>
                    {hoverCoord ? (
                      <span>
                        Die (X: {hoverCoord.x}, Y: {hoverCoord.y}) •{" "}
                        <strong
                          className={
                            hoverCoord.val === 2
                              ? "text-red-400"
                              : hoverCoord.val === 1
                              ? "text-emerald-400"
                              : "text-slate-500"
                          }
                        >
                          {hoverCoord.val === 2 ? "DEFECT" : hoverCoord.val === 1 ? "NOMINAL" : "SUBSTRATE"}
                        </strong>
                      </span>
                    ) : (
                      <span>Hover coordinates to inspect dies</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">{dieStats.total - dieStats.defect} pass</span>
                    <span>•</span>
                    <span className="text-red-400 font-bold">{dieStats.defect} defect</span>
                    <span>•</span>
                    <span>{dieStats.density}% density</span>
                  </div>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-3 text-center transition-all ${
                  dragActive ? "border-blue-500 bg-blue-50/20" : "border-border hover:border-blue-400 bg-muted/20"
                }`}
              >
                <input
                  type="file"
                  accept="image/*,.npy,.json"
                  onChange={handleFileInput}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title="Upload wafer image, .npy or .json"
                />
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>
                    <strong>Drop a wafer image</strong> (.png, .jpg, .npy, .json) or{" "}
                    <span className="text-blue-600 underline">browse</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Lot Telemetry & Sensor JSON Editor */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  Lot Context & Sensory Telemetry JSON
                </h2>
                <span className="text-[11px] font-mono text-muted-foreground">SECOM Feature Space</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-muted-foreground text-[11px] mb-1 font-medium">Lot Identifier</label>
                  <input
                    type="text"
                    value={lotId}
                    onChange={(e) => setLotId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background font-mono text-xs focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. L-4471"
                  />
                </div>
                <div>
                  <label className="block text-muted-foreground text-[11px] mb-1 font-medium">Equipment Path</label>
                  <input
                    type="text"
                    value={equipmentText}
                    onChange={(e) => setEquipmentText(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background font-mono text-xs focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. ETCH-07, CMP-03"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-muted-foreground text-[11px] font-medium">In-line Sensor Channels (JSON)</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSensorJson(
                          JSON.stringify(
                            {
                              sensor_23: 4.85,
                              sensor_24: 3.2,
                              rf_power_target_w: 1750.0,
                              chamber_pressure_mt: 82.0,
                            },
                            null,
                            2
                          )
                        );
                        setJsonError(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-border text-muted-foreground"
                    >
                      + RF Spike
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSensorJson(
                          JSON.stringify(
                            {
                              sensor_12: 3.1,
                              sensor_45: 2.45,
                              slurry_flow_rate: 0.72,
                              down_force_psi: 4.85,
                            },
                            null,
                            2
                          )
                        );
                        setJsonError(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-border text-muted-foreground"
                    >
                      + Slurry Deficit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSensorJson(
                          JSON.stringify(
                            {
                              sensor_tester_01: 0.1,
                              sensor_12: 0.05,
                              sensor_23: 0.02,
                              sensor_45: 0.08,
                            },
                            null,
                            2
                          )
                        );
                        setJsonError(null);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-border text-muted-foreground"
                    >
                      Nominal
                    </button>
                  </div>
                </div>
                <textarea
                  rows={7}
                  value={sensorJson}
                  onChange={(e) => {
                    setSensorJson(e.target.value);
                    try {
                      JSON.parse(e.target.value);
                      setJsonError(null);
                    } catch (err: any) {
                      setJsonError(err.message);
                    }
                  }}
                  className={`w-full p-2.5 rounded-lg font-mono text-xs border leading-relaxed ${
                    jsonError ? "border-red-500 bg-red-50/20" : "border-input bg-slate-950 text-slate-200"
                  } focus:outline-hidden focus:ring-1 focus:ring-blue-500`}
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1 font-mono">
                    <AlertTriangle className="w-3 h-3" />
                    Syntax Error: {jsonError}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── Right Column: Execution Stepper & Inspector (7 cols) ── */}
          <div className="lg:col-span-7 space-y-4">
            {/* View Mode Tabs */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
                <button
                  onClick={() => setActiveTab("visual")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === "visual"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-blue-600" />
                  Visual Diagnostic Stepper
                </button>
                <button
                  onClick={() => setActiveTab("trace")}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    activeTab === "trace"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-blue-600" />
                  MCP Wire Trace & AI Calls ({pipelineResult?.steps?.length ?? 6})
                </button>
              </div>

              {pipelineResult && (
                <span className="text-xs font-mono text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  All 6 Tools Succeeded in {pipelineResult.total_execution_ms}ms
                </span>
              )}
            </div>

            {/* If Not Run Yet */}
            {!pipelineResult && !isRunning && (
              <div className="bg-card border border-border rounded-xl p-10 text-center space-y-3 shadow-xs">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-foreground font-space">
                  Ready to Run Live Tool Chain
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  Click the button below to execute all 6 MCP stages sequentially: WaferCNN defect vision, multivariate anomaly scoring, vector case retrieval, tool telemetry, grounded AI reasoning, and containment playbook generation.
                </p>
                <button
                  onClick={runFullPipeline}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Run Pipeline Now
                </button>
              </div>
            )}

            {/* Running Loader */}
            {isRunning && (
              <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4 shadow-xs">
                <div className="w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto" />
                <div>
                  <h3 className="text-sm font-bold text-foreground font-space">
                    Executing MCP Tool {activeRunningStep} of 6…
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {activeRunningStep === 1 && "Invoking classify_wafer_map (WaferCNN + TTA-8)…"}
                    {activeRunningStep === 2 && "Invoking score_sensor_anomaly (Isolation Forest)…"}
                    {activeRunningStep === 3 && "Invoking retrieve_similar_cases (Vector Incident Store)…"}
                    {activeRunningStep === 4 && "Invoking query_telemetry (SECS/GEM Fleet Interface)…"}
                    {activeRunningStep === 5 && "Invoking rank_root_causes (IBM Bob Grounded Reasoning)…"}
                    {activeRunningStep === 6 && "Invoking get_corrective_action_playbook (Cleanroom SOP)…"}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 1: Visual Diagnostic Stepper */}
            {pipelineResult && activeTab === "visual" && (
              <div className="space-y-4">
                {/* 1. Vision Result Card */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center font-mono">
                        1
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Wafer Defect Vision (WaferCNN + TTA-8)
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pipelineResult.steps[0]?.execution_ms}ms
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Predicted Spatial Class</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className="px-2 py-0.5 rounded text-sm font-bold text-white uppercase tracking-wider"
                          style={{
                            backgroundColor:
                              CLASS_COLORS[pipelineResult.classification.predicted_class] || "#3b82f6",
                          }}
                        >
                          {pipelineResult.classification.predicted_class}
                        </span>
                        <span className="text-sm font-semibold font-mono text-foreground">
                          {Math.round(pipelineResult.classification.confidence * 100)}% Confidence
                        </span>
                      </div>
                    </div>

                    <div className="text-xs font-mono text-muted-foreground text-right">
                      <div>Benchmark: 0.9232 Macro-F1</div>
                      <div className="text-[11px] text-emerald-600 font-semibold">TTA-8 Dihedral Augmentation</div>
                    </div>
                  </div>

                  {/* 9-Class Probabilities Bar Chart */}
                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Softmax Probabilities Across All 9 Classes
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                      {Object.entries(pipelineResult.classification.class_probabilities || {}).map(
                        ([clsName, prob]) => {
                          const isTop = clsName === pipelineResult.classification.predicted_class;
                          return (
                            <div key={clsName} className="space-y-0.5">
                              <div className="flex justify-between text-[10px]">
                                <span className={isTop ? "font-bold text-foreground" : "text-muted-foreground"}>
                                  {clsName}
                                </span>
                                <span className={isTop ? "font-bold text-blue-600" : "text-muted-foreground"}>
                                  {(prob * 100).toFixed(1)}%
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, prob * 100)}%`,
                                    backgroundColor: isTop
                                      ? CLASS_COLORS[clsName] || "#3b82f6"
                                      : "#94a3b8",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Sensor Anomaly Result Card */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center font-mono">
                        2
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Multivariate Telemetry Anomaly (Isolation Forest)
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pipelineResult.steps[1]?.execution_ms}ms
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Anomaly Score</div>
                      <div className="text-xl font-bold font-mono text-foreground flex items-center gap-2">
                        {pipelineResult.anomaly.anomaly_score.toFixed(4)}
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            pipelineResult.anomaly.anomaly_score > 0.6
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {pipelineResult.anomaly.anomaly_score > 0.6 ? "High Anomaly" : "Normal Baseline"}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Top Deviating Sensors</div>
                      <div className="flex gap-1 mt-1 justify-end flex-wrap">
                        {pipelineResult.anomaly.top_deviating_sensors?.map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded bg-red-50 text-red-800 text-[11px] font-mono font-semibold border border-red-200"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Historical Case Precedent */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center font-mono">
                        3
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Historical Case Precedents (Vector Match)
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pipelineResult.steps[2]?.execution_ms}ms
                    </span>
                  </div>

                  <div className="space-y-2">
                    {pipelineResult.cases?.cases?.slice(0, 2).map((c) => (
                      <div
                        key={c.case_id}
                        className="p-3 rounded-lg border border-border bg-background flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground font-mono">{c.case_id}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold bg-muted text-muted-foreground">
                              {c.category}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">Tool: {c.equipment_id}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{c.confirmed_root_cause}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold font-mono text-blue-700">
                            {(c.similarity * 100).toFixed(1)}% Match
                          </div>
                          <div className="text-[10px] text-muted-foreground font-mono">Cosine Embedding</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Ranked Root Cause Diagnosis */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center font-mono">
                        4 & 5
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Grounded Root-Cause Hypotheses
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pipelineResult.steps[4]?.execution_ms}ms
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {pipelineResult.ranked?.hypotheses?.map((hyp, i) => (
                      <div
                        key={i}
                        className={`p-3.5 rounded-lg border ${
                          i === 0
                            ? "border-blue-300 bg-blue-50/40"
                            : "border-border bg-background"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                                  i === 0 ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"
                                }`}
                              >
                                Rank #{i + 1} • {hyp.category}
                              </span>
                              <span className="text-xs font-bold font-mono text-foreground">
                                {Math.round(hyp.confidence * 100)}% Confidence
                              </span>
                            </div>
                            <h4 className="text-xs font-semibold text-foreground leading-snug">
                              {hyp.description}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">
                              {hyp.evidence_summary}
                            </p>
                          </div>
                        </div>

                        {/* Evidence Checklist */}
                        {hyp.supporting_evidence && hyp.supporting_evidence.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground">Verified Citations:</span>
                            {hyp.supporting_evidence.map((ev, ei) => (
                              <span
                                key={ei}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-card border border-border text-foreground font-medium"
                              >
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                {ev}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 5. Corrective Actions Playbook */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center font-mono">
                        6
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Corrective Action Containment Playbook
                      </span>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {pipelineResult.steps[5]?.execution_ms}ms
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {pipelineResult.actions?.actions?.map((act, ai) => (
                      <div
                        key={ai}
                        className="flex items-start gap-2.5 p-2 rounded-lg bg-background border border-border text-xs"
                      >
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {ai + 1}
                        </span>
                        <span className="text-foreground leading-relaxed">{act}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Raw MCP Wire Trace */}
            {pipelineResult && activeTab === "trace" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-muted/40 p-3 rounded-lg border border-border text-xs text-muted-foreground">
                  <span>
                    Below is the auditable wire trace of all 6 MCP tool calls executed in sequence. Each shows inputs, outputs, and hardware latency.
                  </span>
                  <span className="font-mono font-semibold text-foreground">
                    Total: {pipelineResult.total_execution_ms}ms
                  </span>
                </div>

                {pipelineResult.steps.map((step) => (
                  <div
                    key={step.step_number}
                    className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[11px]">
                          Tool #{step.step_number}
                        </span>
                        <span className="font-bold text-foreground">{step.tool_name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase px-1.5 py-0.5 rounded bg-muted">
                          {step.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-600 font-bold">{step.execution_ms}ms</span>
                        <button
                          onClick={() => copyStepJson(step.step_number, step)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                          title="Copy step JSON"
                        >
                          {copiedStep === step.step_number ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-sans">
                      <strong>Summary:</strong> {step.summary}
                    </div>

                    {/* Arguments & Output Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                          <span>Arguments Payload</span>
                          <span>JSON</span>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[10px] overflow-x-auto max-h-48 scrollbar-thin">
                          {JSON.stringify(step.input_payload, null, 2)}
                        </pre>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground flex items-center justify-between">
                          <span>Tool Return Output</span>
                          <span>JSON</span>
                        </div>
                        <pre className="p-2.5 rounded-lg bg-slate-950 text-slate-200 text-[10px] overflow-x-auto max-h-48 scrollbar-thin">
                          {JSON.stringify(step.output_payload, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
