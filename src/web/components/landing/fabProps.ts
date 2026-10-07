// Set dressing for the landing page's fab room: a bay of other process tools
// under a back wall, an overhead wafer transport (OHT) delivering FOUPs to the
// line's input port, a FOUP stocker, and floor safety markings. Built with the
// same helpers, materials and disposal list as FabScene, so it is torn down with
// it. Anything mounted on another surface stands clear of it or carries a depth
// bias: coplanar faces z-fight (flicker) while the camera drifts.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type Vec3 = [number, number, number];

export type Kit = {
  scene: THREE.Scene;
  own: <T extends { dispose: () => void }>(x: T) => T;
  mat: (color: number, rough?: number, metal?: number, extra?: THREE.MeshStandardMaterialParameters) => THREE.MeshStandardMaterial;
  add: (geo: THREE.BufferGeometry, m: THREE.Material, pos: Vec3, parent?: THREE.Object3D, shadow?: boolean) => THREE.Mesh;
  m: { anodised: THREE.Material; steel: THREE.Material; paint: THREE.Material; charcoal: THREE.Material };
};

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const decal = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

// ── stack light ──────────────────────────────────────────────────────────────

export type Lamp = "green" | "amber" | "red";
/** Red / amber / green tower; the lit lamp's material is returned so it can pulse. */
export function stackLight(k: Kit, pos: Vec3, lit: Lamp, parent: THREE.Object3D = k.scene) {
  const pole = new THREE.Group();
  pole.position.set(...pos);
  parent.add(pole);
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12), k.m.steel, [0, 0.25, 0], pole);
  const spec: Record<Lamp, [number, number, number, number]> = {     // y, colour, lit glow, dim glow
    green: [0.62, 0x2fbf6b, 0x2fe07a, 0x08200f],
    amber: [0.8, 0xd99a1e, 0xffb020, 0x3a2a08],
    red: [0.98, 0xd0342a, 0xff3b2e, 0x2a0806],
  };
  let litMat: THREE.MeshStandardMaterial | null = null;
  for (const lamp of ["green", "amber", "red"] as Lamp[]) {
    const [y, color, glow, dim] = spec[lamp];
    const on = lamp === lit;
    const m = k.mat(on ? color : 0x6b6f75, 0.3, 0, { emissive: on ? glow : dim, emissiveIntensity: on ? 1.6 : 0.3 });
    if (on) litMat = m;
    k.add(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 24), m, [0, y, 0], pole);
  }
  k.add(new THREE.CylinderGeometry(0.115, 0.115, 0.04, 24), k.m.charcoal, [0, 1.09, 0], pole);
  return litMat!;
}

// ── FOUP (front-opening unified pod: the box wafers travel in) ───────────────

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material; offset: Vec3 };
function foupParts(k: Kit): Part[] {
  return [
    { geo: k.own(new RoundedBoxGeometry(0.9, 0.72, 0.85, 3, 0.08)), mat: k.mat(0xc6ccd3, 0.42, 0.05), offset: [0, 0, 0] },
    { geo: k.own(new RoundedBoxGeometry(0.8, 0.6, 0.04, 2, 0.02)), mat: k.mat(0x868d96, 0.5, 0.1), offset: [0, -0.01, 0.44] },
    { geo: k.own(new THREE.BoxGeometry(0.14, 0.05, 0.03)), mat: k.mat(0x2f6fb0, 0.4, 0.1), offset: [0, 0.12, 0.47] },
    { geo: k.own(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16)), mat: k.m.charcoal, offset: [0, 0.4, 0] },
    { geo: k.own(new RoundedBoxGeometry(0.5, 0.05, 0.5, 2, 0.02)), mat: k.mat(0xb7bdc4, 0.35, 0.2), offset: [0, 0.46, 0] },
  ];
}
export const FOUP_HALF_H = 0.36;      // body centre to bottom
export const FOUP_TOP = 0.485;        // body centre to top of the handling flange

/** Many static FOUPs in one draw call per part. Each transform is the body centre. */
function instancedFoups(k: Kit, parts: Part[], at: { pos: Vec3; rotY: number }[]) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (const p of parts) {
    const inst = new THREE.InstancedMesh(p.geo, p.mat, at.length);
    at.forEach((a, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a.rotY);
      const off = new THREE.Vector3(...p.offset).applyQuaternion(q);
      m4.compose(new THREE.Vector3(a.pos[0] + off.x, a.pos[1] + off.y, a.pos[2] + off.z), q, one);
      inst.setMatrixAt(i, m4);
    });
    inst.castShadow = true; inst.receiveShadow = true;
    k.scene.add(inst);
  }
}

function foupGroup(parts: Part[]) {
  const g = new THREE.Group();
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geo, p.mat);
    mesh.position.set(...p.offset);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

// ── tool bay ─────────────────────────────────────────────────────────────────

const toolScreen = (name: string, state: string, color: string) => canvasTexture(256, 160, (g) => {
  g.fillStyle = "#0d1319"; g.fillRect(0, 0, 256, 160);
  g.fillStyle = color; g.font = "600 24px 'IBM Plex Mono', monospace"; g.fillText(name, 16, 40);
  g.fillStyle = "#9fb3c8"; g.font = "500 18px 'IBM Plex Mono', monospace"; g.fillText(state, 16, 76);
  g.fillStyle = "#1f2a35"; g.fillRect(16, 104, 224, 14);
  g.fillStyle = color; g.fillRect(16, 104, state === "ALARM" ? 224 : 150, 14);
});

type ToolSpec = { name: string; x: number; chambers: number; height: number; lamp: Lamp; state: string; color: string };

/**
 * A row of process tools behind the line, facing it across the aisle. Their
 * names are the equipment in the app's own data; ETCH-07, the tool behind
 * L-4471's excursion, shows a red lamp.
 */
export function buildToolBay(k: Kit, parts: ReturnType<typeof foupParts>) {
  const Z = -8.6;
  const tools: ToolSpec[] = [
    { name: "LITHO-02", x: -12, chambers: 0, height: 2.9, lamp: "green", state: "RUNNING", color: "#7fd1ae" },
    { name: "ETCH-07", x: -5, chambers: 3, height: 2.5, lamp: "red", state: "ALARM", color: "#ff6b5f" },
    { name: "CMP-03", x: 2.5, chambers: 2, height: 2.5, lamp: "amber", state: "WARNING", color: "#f2b84b" },
    { name: "DEPO-11", x: 10, chambers: 3, height: 2.6, lamp: "green", state: "RUNNING", color: "#7fd1ae" },
  ];
  const pulsing: THREE.MeshStandardMaterial[] = [];
  const ports: { pos: Vec3; rotY: number }[] = [];
  for (const t of tools) {
    k.add(new RoundedBoxGeometry(3.6, 0.3, 2.6, 2, 0.05), k.m.charcoal, [t.x, 0.15, Z]);
    k.add(new RoundedBoxGeometry(3.4, t.height, 2.2, 4, 0.1), k.m.paint, [t.x, 0.3 + t.height / 2, Z]);
    // equipment front-end module (EFEM) across the front, with two load ports
    const front = Z + 1.1 + 0.36;
    k.add(new RoundedBoxGeometry(3.4, 1.55, 0.7, 3, 0.06), k.m.paint, [t.x, 0.3 + 0.775, front]);
    for (const dx of [-0.85, 0.85]) {
      k.add(new RoundedBoxGeometry(1.05, 0.08, 0.9, 2, 0.02), k.m.charcoal, [t.x + dx, 1.12, front + 0.62]);
      ports.push({ pos: [t.x + dx, 1.165 + FOUP_HALF_H, front + 0.62], rotY: 0 });
    }
    // status screen on the tool face above the front module, 2 cm proud of its frame
    const faceZ = Z + 1.1, sy = 0.3 + t.height - 0.42;
    k.add(new RoundedBoxGeometry(1.0, 0.66, 0.05, 2, 0.02), k.m.charcoal, [t.x - 0.8, sy, faceZ + 0.03]);
    k.add(new THREE.PlaneGeometry(0.9, 0.56),
          k.own(new THREE.MeshBasicMaterial({ map: k.own(toolScreen(t.name, t.state, t.color)), toneMapped: false })),
          [t.x - 0.8, sy, faceZ + 0.075], k.scene, false);
    // process chambers on the roof
    for (let c = 0; c < t.chambers; c++) {
      const cx = t.x - 0.9 + c * 0.9;
      k.add(new THREE.CylinderGeometry(0.38, 0.38, 0.55, 32), k.m.steel, [cx, 0.3 + t.height + 0.275, Z - 0.3]);
      k.add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 32), k.m.charcoal, [cx, 0.3 + t.height + 0.58, Z - 0.3]);
    }
    pulsing.push(stackLight(k, [t.x + 1.4, 0.3 + t.height, Z + 0.8], t.lamp));
  }
  instancedFoups(k, parts, ports);
  return pulsing;
}

// ── back wall ────────────────────────────────────────────────────────────────

export function buildBackWall(k: Kit) {
  const W = 72, H = 9, Z = -14;
  const tex = canvasTexture(2048, 256, (g) => {
    g.fillStyle = "#dfe2e6"; g.fillRect(0, 0, 2048, 256);
    // window band of matte blue-grey panes, cleanroom gallery style
    g.fillStyle = "#b9c3cd"; g.fillRect(0, 70, 2048, 64);
    g.fillStyle = "#d3d8de";
    for (let x = 0; x < 2048; x += 57) g.fillRect(x, 70, 3, 64);
    g.fillStyle = "#c7ccd2"; g.fillRect(0, 66, 2048, 4); g.fillRect(0, 134, 2048, 4);
    // wall panel seams
    g.fillStyle = "rgba(90,98,108,0.25)";
    for (let x = 0; x < 2048; x += 57) g.fillRect(x, 138, 2, 118);
    g.fillRect(0, 200, 2048, 2);
    // skirting
    g.fillStyle = "#9aa1a9"; g.fillRect(0, 244, 2048, 12);
  });
  const wall = k.add(new THREE.PlaneGeometry(W, H), k.mat(0xffffff, 0.85, 0, { map: k.own(tex) }), [0, H / 2, Z], k.scene, false);
  wall.castShadow = false;
  const sign = canvasTexture(1024, 192, (g) => {
    g.fillStyle = "#274c6b"; g.fillRect(0, 0, 1024, 192);
    g.fillStyle = "#ffffff"; g.font = "700 84px 'Space Grotesk', sans-serif"; g.fillText("BAY 07", 48, 118);
    g.fillStyle = "#c9d6e2"; g.font = "500 52px 'IBM Plex Mono', monospace"; g.fillText("WAFER SORT", 420, 114);
    g.fillStyle = "#e8c22a"; g.fillRect(0, 168, 1024, 24);
  });
  k.add(new THREE.PlaneGeometry(6, 1.125), k.own(new THREE.MeshBasicMaterial({ map: k.own(sign), toneMapped: false })),
        [-1, 6.6, Z + 0.06], k.scene, false);
}

// ── FOUP stocker and the line's input load port ──────────────────────────────

export const PORT: Vec3 = [-17.4, 1.12, 0];          // top of the input load port

export function buildStockerAndPort(k: Kit, parts: ReturnType<typeof foupParts>) {
  // input load port at the head of the conveyor
  k.add(new RoundedBoxGeometry(1.25, PORT[1] - 0.05, 1.25, 3, 0.05), k.m.paint, [PORT[0], (PORT[1] - 0.05) / 2, PORT[2]]);
  k.add(new RoundedBoxGeometry(1.1, 0.08, 1.1, 2, 0.02), k.m.charcoal, [PORT[0], PORT[1] - 0.02, PORT[2]]);
  // stocker rack: three shelves of three FOUPs, side-on to the aisle
  const X = -21.5, Z = -4.2, levels = [0.35, 1.7, 3.05];
  for (const dx of [-1.65, 1.65]) for (const dz of [-0.55, 0.55])
    k.add(new THREE.BoxGeometry(0.08, 4.2, 0.08), k.m.anodised, [X + dx, 2.1, Z + dz]);
  const slots: { pos: Vec3; rotY: number }[] = [];
  for (const y of levels) {
    k.add(new THREE.BoxGeometry(3.4, 0.06, 1.2), k.m.anodised, [X, y, Z]);
    for (const dx of [-1.05, 0, 1.05]) slots.push({ pos: [X + dx, y + 0.035 + FOUP_HALF_H, Z], rotY: 0 });
  }
  instancedFoups(k, parts, slots);
}

// ── overhead hoist transport ─────────────────────────────────────────────────

/**
 * A ceiling rail over the line and a carrier that, on a loop: brings a FOUP in
 * from +x, lowers it onto the input port, leaves to -x; then comes back empty,
 * picks the FOUP up again, and leaves to +x. Returns update(elapsedSeconds).
 */
export function buildOHT(k: Kit, parts: ReturnType<typeof foupParts>) {
  const RAIL_Y = 6.0, RAIL_Z = PORT[2];
  k.add(new THREE.BoxGeometry(64, 0.14, 0.34), k.m.steel, [-2, RAIL_Y, RAIL_Z]);
  k.add(new THREE.BoxGeometry(64, 0.05, 0.6), k.m.steel, [-2, RAIL_Y - 0.09, RAIL_Z]);
  const hangers = new THREE.InstancedMesh(k.own(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 8)), k.m.steel, 16);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) hangers.setMatrixAt(i, m4.makeTranslation(-32 + i * 4, RAIL_Y + 1.65, RAIL_Z));
  k.scene.add(hangers);

  const carrier = new THREE.Group();
  k.scene.add(carrier);
  const body = k.mat(0xf1f2f0, 0.5, 0.05);
  k.add(new RoundedBoxGeometry(1.3, 0.7, 1.05, 3, 0.08), body, [0, -0.5, 0], carrier);
  k.add(new THREE.BoxGeometry(1.32, 0.1, 1.07), k.mat(0x274c6b, 0.5), [0, -0.38, 0], carrier);
  k.add(new RoundedBoxGeometry(0.9, 0.22, 0.5, 2, 0.04), k.m.charcoal, [0, -0.08, 0], carrier);
  const gripper = k.add(new RoundedBoxGeometry(0.95, 0.07, 0.9, 2, 0.02), k.m.charcoal, [0, 0, 0], carrier);
  const cableGeo = k.own(new THREE.CylinderGeometry(0.012, 0.012, 1, 6));
  const cables = [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]].map(([x, z]) => {
    const c = new THREE.Mesh(cableGeo, k.m.charcoal);
    c.position.set(x, 0, z);
    carrier.add(c);
    return c;
  });
  const foup = foupGroup(parts);
  k.scene.add(foup);

  const BODY_BOTTOM = -0.85;                               // relative to the rail
  const restDrop = 0.12;                                    // gripper just under the body
  // drop that puts the carried FOUP's base on the port (gripper is 0.07 thick)
  const portDrop = RAIL_Y + BODY_BOTTOM - 0.035 - FOUP_TOP - (PORT[1] + FOUP_HALF_H);
  const IN_X = 30, OUT_X = -34;
  type Seg = { dur: number; x?: [number, number]; drop?: [number, number]; hold: "carried" | "port" };
  const segs: Seg[] = [
    { dur: 6.5, x: [IN_X, PORT[0]], hold: "carried" },
    { dur: 2.4, drop: [restDrop, portDrop], hold: "carried" },
    { dur: 0.6, hold: "port" },
    { dur: 2.4, drop: [portDrop, restDrop], hold: "port" },
    { dur: 3.6, x: [PORT[0], OUT_X], hold: "port" },
    { dur: 3.0, hold: "port" },
    { dur: 3.6, x: [OUT_X, PORT[0]], hold: "port" },
    { dur: 2.4, drop: [restDrop, portDrop], hold: "port" },
    { dur: 0.6, hold: "carried" },
    { dur: 2.4, drop: [portDrop, restDrop], hold: "carried" },
    { dur: 6.5, x: [PORT[0], IN_X], hold: "carried" },
  ];
  const total = segs.reduce((a, s) => a + s.dur, 0);
  let x = IN_X, drop = restDrop;

  return (elapsed: number) => {
    let t = elapsed % total, seg = segs[0], u = 0;
    for (const s of segs) { if (t < s.dur) { seg = s; u = easeInOut(t / s.dur); break; } t -= s.dur; }
    if (seg.x) x = seg.x[0] + (seg.x[1] - seg.x[0]) * u;
    if (seg.drop) drop = seg.drop[0] + (seg.drop[1] - seg.drop[0]) * u;
    carrier.position.set(x, RAIL_Y, RAIL_Z);
    const gy = BODY_BOTTOM - drop;
    gripper.position.y = gy;
    const len = Math.max(0.01, BODY_BOTTOM - gy);          // body underside to gripper
    for (const c of cables) { c.scale.y = len; c.position.y = (BODY_BOTTOM + gy) / 2; }
    if (seg.hold === "carried") foup.position.set(x, RAIL_Y + gy - 0.035 - FOUP_TOP, RAIL_Z);
    else foup.position.set(PORT[0], PORT[1] + FOUP_HALF_H, PORT[2]);
  };
}

// ── floor safety markings ────────────────────────────────────────────────────

export function buildFloorMarkings(k: Kit) {
  const Y = 0.004;
  const yellow = k.mat(0xe2b322, 0.6, 0, decal);
  const line = (x0: number, x1: number, z: number, w = 0.12) => {
    const m = k.add(new THREE.PlaneGeometry(x1 - x0, w), yellow, [(x0 + x1) / 2, Y, z], k.scene, false);
    m.rotation.x = -Math.PI / 2;
  };
  line(-26, 24, -3.6);                       // aisle, line side of the tool bay
  line(-26, 24, -6.2);                       // aisle, tool side
  line(-26, 24, 3.6);                        // walkway edge by the line
  line(-26, 5.6, 4.9);                       // walkway's outer edge, up to the desk

  // keep-out hatching around the probe tester: a striped frame
  const hatch = canvasTexture(512, 512, (g) => {
    g.clearRect(0, 0, 512, 512);
    g.save();
    g.beginPath(); g.rect(0, 0, 512, 512); g.rect(40, 40, 432, 432); g.clip("evenodd");
    g.fillStyle = "#1d1f22"; g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#e2b322";
    for (let i = -512; i < 1024; i += 48) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 + 512, 512); g.lineTo(i + 512, 512); g.fill();
    }
    g.restore();
  });
  const frame = k.add(new THREE.PlaneGeometry(6.6, 6.6),
                      k.mat(0xffffff, 0.6, 0, { map: k.own(hatch), transparent: true, depthWrite: false, ...decal }),
                      [0, Y + 0.001, 0], k.scene, false);
  frame.rotation.x = -Math.PI / 2;
}

/** Everything above, in one call. Returns per-frame updates for FabScene's loop. */
export function buildRoom(k: Kit) {
  const parts = foupParts(k);
  buildBackWall(k);
  const lamps = buildToolBay(k, parts);
  buildStockerAndPort(k, parts);
  const oht = buildOHT(k, parts);
  buildFloorMarkings(k);
  return (elapsed: number) => {
    oht(elapsed);
    const glow = 1.3 + 0.3 * Math.sin(elapsed * 2.2);
    for (const m of lamps) m.emissiveIntensity = glow;
  };
}
