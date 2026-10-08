"use client";

// One hypothesis on the left, every evidence reference it makes on the right,
// grouped by the tool that produced the evidence. Edge colour is the verdict of
// the server-side citation check (src/api/evidence_graph.py), not a guess here:
// verified, value mismatch, not returned by any tool, or flagged but not cited.

export type EvidenceLink = {
  kind: string; ref: string; status: "verified" | "value_mismatch" | "not_in_evidence";
  source: string; claimed: number | string | null; actual: number | string | null;
};
export type EvidenceCheck = {
  links: EvidenceLink[];
  uncited: { kind: string; ref: string; source: string; actual: number | string | null }[];
  summary: { verified: number; value_mismatch: number; not_in_evidence: number; uncited: number };
};

type Status = EvidenceLink["status"] | "uncited";

const LANES: { key: string; label: string; kinds: string[]; opens?: "wafer" | "sensor" }[] = [
  { key: "vision", label: "VISION · classify_wafer_map", kinds: ["defect_class"], opens: "wafer" },
  { key: "sensor", label: "SENSORS · score_sensor_anomaly", kinds: ["sensor"], opens: "sensor" },
  { key: "case", label: "PAST CASES · retrieve_similar_cases", kinds: ["case"] },
  { key: "telemetry", label: "TELEMETRY · query_telemetry", kinds: ["telemetry"] },
  { key: "lot", label: "LOT RECORD · get_lot_data", kinds: ["process_param", "equipment"] },
  { key: "none", label: "NOT IN ANY TOOL OUTPUT", kinds: ["unknown"] },
];

export const STATUS_STYLE: Record<Status, { color: string; dash?: string; label: string }> = {
  verified: { color: "#2e6e58", label: "Verified" },
  value_mismatch: { color: "#b8852c", label: "Value doesn't match" },
  not_in_evidence: { color: "#b5473f", dash: "5 4", label: "Not in the evidence" },
  uncited: { color: "#9aabb8", dash: "2 4", label: "Flagged, not cited" },
};

const fmt = (v: number | string | null | undefined, kind: string) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (kind === "case") return `${Math.round(v * 100)}% similar`;
  if (kind === "sensor" || kind === "telemetry") return `${v > 0 ? "+" : ""}${v}σ`;
  return String(v);
};

function detail(n: { kind: string; status: Status; claimed?: number | string | null; actual: number | string | null }) {
  if (n.status === "not_in_evidence") return "no tool returned this";
  if (n.status === "value_mismatch") return `cited ${fmt(n.claimed ?? null, n.kind)} · actual ${fmt(n.actual, n.kind)}`;
  if (n.status === "uncited") return `flagged ${fmt(n.actual, n.kind)} · not cited`;
  return fmt(n.actual, n.kind) || "present";
}

export default function EvidenceGraph({ title, check, onOpen }: {
  title: string; check: EvidenceCheck; onOpen?: (d: "wafer" | "sensor") => void;
}) {
  type Node = { kind: string; ref: string; status: Status; claimed?: number | string | null; actual: number | string | null };
  const nodes: Node[] = [
    ...check.links.map((l) => ({ ...l, status: l.status as Status })),
    ...check.uncited.map((u) => ({ ...u, status: "uncited" as Status })),
  ];
  const lanes = LANES.map((l) => ({ ...l, nodes: nodes.filter((n) => l.kinds.includes(n.kind)) }))
    .filter((l) => l.nodes.length);

  const W = 760, NODE_H = 30, GAP = 6, HEAD = 18, LANE_GAP = 12, X = 330, NODE_W = 410;
  const laneH = (n: number) => HEAD + n * (NODE_H + GAP) + LANE_GAP;
  const placed = lanes.map((lane, li) => {
    const top = 4 + lanes.slice(0, li).reduce((acc, l) => acc + laneH(l.nodes.length), 0);
    const items = lane.nodes.map((n, i) => ({ n, y: top + HEAD + i * (NODE_H + GAP) }));
    return { lane, top, items };
  });
  const H = Math.max(4 + lanes.reduce((acc, l) => acc + laneH(l.nodes.length), 0), 120);
  const hy = H / 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         aria-label={`Evidence cited by: ${title}`} style={{ display: "block", font: "11px 'DM Sans', sans-serif" }}>
      {/* edges first, so nodes paint over their ends */}
      {placed.flatMap(({ items }) => items.map(({ n, y: ny }) => {
        const s = STATUS_STYLE[n.status], ey = ny + NODE_H / 2;
        return (
          <path key={`e-${n.kind}-${n.ref}`} d={`M 250 ${hy} C 290 ${hy}, 290 ${ey}, ${X} ${ey}`}
                fill="none" stroke={s.color} strokeWidth={n.status === "uncited" ? 1.2 : 1.8}
                strokeDasharray={s.dash} opacity={n.status === "uncited" ? 0.8 : 1} />
        );
      }))}

      {/* hypothesis */}
      <foreignObject x={0} y={hy - 46} width={250} height={92}>
        <div style={{ height: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #274c6b",
                      borderRadius: 8, background: "#f3f6f9", color: "#1c2733", fontSize: 11, lineHeight: 1.35,
                      overflow: "hidden" }}>
          <div style={{ font: "600 8.5px 'IBM Plex Mono', monospace", color: "#6a8da9", letterSpacing: 0.6, marginBottom: 3 }}>
            HYPOTHESIS
          </div>
          {title}
        </div>
      </foreignObject>

      {placed.map(({ lane, top, items }) => (
        <g key={lane.key}>
          <text x={X} y={top + 11} style={{ font: "600 8.5px 'IBM Plex Mono', monospace", letterSpacing: 0.6 }}
                fill={lane.key === "none" ? "#b5473f" : "#8a98a4"}>{lane.label}</text>
          {items.map(({ n, y: ny }) => {
            const s = STATUS_STYLE[n.status];
            const clickable = !!(lane.opens && onOpen && n.status !== "not_in_evidence");
            return (
              <g key={`${n.kind}-${n.ref}`} transform={`translate(${X},${ny})`}
                 style={{ cursor: clickable ? "pointer" : "default" }}
                 onClick={clickable ? () => onOpen!(lane.opens!) : undefined}>
                <rect width={NODE_W} height={NODE_H} rx={6} fill="#ffffff" stroke={s.color}
                      strokeDasharray={s.dash} strokeWidth={1.2} />
                <rect width={4} height={NODE_H} rx={2} fill={s.color} />
                <text x={12} y={19} fill="#1c2733" style={{ font: "600 11px 'IBM Plex Mono', monospace" }}>{n.ref}</text>
                <text x={NODE_W - 10} y={19} textAnchor="end" fill={s.color} style={{ fontSize: 10.5 }}>
                  {detail(n)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
