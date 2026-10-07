// The landing page's 3D scene, in plain three.js: a conveyor carrying patterned
// wafers through a probe tester, whose probe card reveals each wafer's real test
// map (green pass / red fail) as it exits, and an engineer's laptop showing the
// result. The belt never stops; the camera travels between five stops, each move
// a timed, eased flight started by the page (goTo), not a frame-per-scroll scrub.
//
// Lighting: Poly Haven "Empty Warehouse 01" HDRI (CC0), public/landing/.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { buildRoom, canvasTexture, stackLight, type Kit } from "./fabProps";

export type LandingWafer = {
  case_id: string; grid: number[][]; predicted_class: string; confidence: number; dies: number; failed: number;
};
export type LandingLot = {
  lot_id: string;
  classification: { predicted_class: string; confidence: number };
  anomaly: { score: number; alarm: boolean; deviations: Record<string, number> };
  case: { case_id: string; similarity: number; confirmed_root_cause: string };
};

const BELT_Y = 0.9;            // top surface of the belt
const SCAN_X = 2.35;           // probe line: test results exist only for x > SCAN_X
const SPEED = 0.7;             // belt speed, world units per second
const SPACING = 3.3, N_WAFERS = 9, LOOP = SPACING * N_WAFERS;
const MOVE_S = 1.7;            // one camera flight between stops

type Pose = { pos: THREE.Vector3; look: THREE.Vector3; shift: number };
// One stop per page section. `shift` slides the picture sideways (a view offset,
// not a camera move) so the subject sits opposite the section's text: negative
// puts it right of centre, positive left.
export const STOP_COUNT = 5;
const STOPS: Pose[] = ([
  { pos: [10.5, 8.2, 15.5], look: [0.5, 0.4, 0], shift: -0.2 },
  { pos: [-12.5, 3.4, 8.0], look: [-4.5, 1.0, 0], shift: -0.18 },
  { pos: [5.4, 4.4, 6.0], look: [3.0, 0.9, 0], shift: 0.2 },
  { pos: [13.6, 3.6, 11.8], look: [9.0, 1.75, 6.4], shift: -0.14 },
  { pos: [16, 11, 22], look: [4, 0.5, 2], shift: 0.22 },
] as { pos: [number, number, number]; look: [number, number, number]; shift: number }[])
  .map((k) => ({ pos: new THREE.Vector3(...k.pos), look: new THREE.Vector3(...k.look), shift: k.shift }));

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** The test result: pass / fail per die, nothing off-wafer. */
const resultTexture = (grid: number[][]) => canvasTexture(512, 512, (g) => {
  const cell = 512 / 64;
  for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
    const v = grid[r][c];
    if (!v) continue;
    g.fillStyle = v === 2 ? "rgba(214,46,38,0.96)" : "rgba(52,168,112,0.82)";
    g.fillRect(c * cell + 0.7, r * cell + 0.7, cell - 1.4, cell - 1.4);
  }
});

/** A patterned wafer before test: the die grid etched into the mirror surface. */
const patternTexture = (grid: number[][]) => canvasTexture(512, 512, (g) => {
  const cell = 512 / 64;
  for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
    if (!grid[r][c]) continue;
    g.fillStyle = "rgba(40,48,62,0.55)";
    g.fillRect(c * cell, r * cell, cell, 1);
    g.fillRect(c * cell, r * cell, 1, cell);
    g.fillStyle = "rgba(150,170,205,0.10)";
    g.fillRect(c * cell + 1.5, r * cell + 1.5, cell - 3, cell - 3);
  }
});

const beltTexture = () => {
  const t = canvasTexture(256, 64, (g) => {
    g.fillStyle = "#1b1e22"; g.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 900; i++) {                      // rubber grain
      g.fillStyle = `rgba(255,255,255,${(i % 7) * 0.005})`;
      g.fillRect((i * 97) % 256, (i * 31) % 64, 1.5, 1.5);
    }
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 2, 64);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 1);
  return t;
};

/** Raised cleanroom floor: 60 cm tiles with seams and a faint perforation. */
const floorTexture = () => {
  const t = canvasTexture(256, 256, (g) => {
    g.fillStyle = "#c9cdd2"; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(60,66,74,0.10)";
    for (let y = 16; y < 256; y += 16) for (let x = 16; x < 256; x += 16) g.fillRect(x, y, 2, 2);
    g.fillStyle = "rgba(60,66,74,0.35)";
    g.fillRect(0, 0, 256, 2); g.fillRect(0, 0, 2, 256);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(70, 70);
  return t;
};

const skyTexture = () => canvasTexture(4, 256, (g) => {
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#eef0f2"); grad.addColorStop(0.6, "#e1e4e8"); grad.addColorStop(1, "#d3d7dc");
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
});

const testerScreen = (lot: LandingLot, w: LandingWafer) => canvasTexture(512, 320, (g) => {
  g.fillStyle = "#0d1319"; g.fillRect(0, 0, 512, 320);
  g.fillStyle = "#7fd1ae"; g.font = "600 26px 'IBM Plex Mono', monospace";
  g.fillText("PROBER 03 · WAFER SORT", 24, 46);
  g.fillStyle = "#9fb3c8"; g.font = "500 22px 'IBM Plex Mono', monospace";
  g.fillText(`LOT ${lot.lot_id}`, 24, 98);
  g.fillText(`DIES ${w.dies.toLocaleString()}`, 24, 136);
  g.fillText("STATUS  TESTING", 24, 174);
  g.fillStyle = "#1f2a35"; g.fillRect(24, 214, 464, 22);
  g.fillStyle = "#3fbf86"; g.fillRect(24, 214, 312, 22);
  g.fillStyle = "#e0483c"; g.fillRect(336, 214, 14, 22);
  g.fillStyle = "#6b7f93"; g.font = "500 18px 'IBM Plex Mono', monospace";
  g.fillText("PROBE CARD PC-11 · 26 SITES", 24, 280);
});

function dashboardTexture(wafer: LandingWafer, lot: LandingLot): THREE.CanvasTexture {
  return canvasTexture(1024, 640, (g) => {
    g.fillStyle = "#f7f6f2"; g.fillRect(0, 0, 1024, 640);
    g.fillStyle = "#274c6b"; g.fillRect(0, 0, 1024, 60);
    g.fillStyle = "#ffffff"; g.font = "700 28px 'Space Grotesk', sans-serif";
    g.fillText("YieldGuard", 30, 40);
    g.font = "500 17px 'IBM Plex Mono', monospace"; g.fillStyle = "#c9d6e2";
    g.fillText(`${lot.lot_id} · ROOT CAUSE INVESTIGATION`, 210, 38);

    g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(30, 86, 420, 524, 14); g.fill();
    const cell = 376 / 64, ox = 52, oy = 108;
    g.fillStyle = "#e9edf0"; g.beginPath(); g.arc(ox + 188, oy + 188, 190, 0, Math.PI * 2); g.fill();
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
      const v = wafer.grid[r][c];
      if (!v) continue;
      g.fillStyle = v === 2 ? "#b5473f" : "#cde7dc";
      g.fillRect(ox + c * cell, oy + r * cell, cell - 0.8, cell - 0.8);
    }
    g.fillStyle = "#6a7d8c"; g.font = "500 16px 'IBM Plex Mono', monospace";
    g.fillText(`${wafer.failed} of ${wafer.dies} dies failed`, 52, 588);

    const x = 480;
    const label = (t: string, y: number) => { g.fillStyle = "#8a98a4"; g.font = "600 14px 'IBM Plex Mono', monospace"; g.fillText(t, x, y); };
    label("DETECTED PATTERN · WaferCNN", 116);
    g.fillStyle = "#1c2733"; g.font = "700 48px 'Space Grotesk', sans-serif";
    g.fillText(lot.classification.predicted_class, x, 170);
    g.fillStyle = "#2e6e58"; g.font = "600 22px 'IBM Plex Mono', monospace";
    g.fillText(`${(lot.classification.confidence * 100).toFixed(2)}%`, x + 290, 168);

    label(`ETCH TOOL TRACE · anomaly ${lot.anomaly.score.toFixed(2)}${lot.anomaly.alarm ? " · ALARM" : ""}`, 232);
    Object.entries(lot.anomaly.deviations).forEach(([k, v], i) => {
      const y = 276 + i * 48;
      g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(x, y - 29, 510, 40, 8); g.fill();
      const col = Math.abs(v) >= 3 ? "#b5473f" : "#b8852c";
      g.fillStyle = col; g.fillRect(x, y - 29, 6, 40);
      g.fillStyle = "#1c2733"; g.font = "600 20px 'DM Sans', sans-serif"; g.fillText(k, x + 20, y - 3);
      g.fillStyle = col; g.font = "600 20px 'IBM Plex Mono', monospace";
      g.textAlign = "right"; g.fillText(`${v > 0 ? "+" : ""}${v.toFixed(1)}σ`, x + 494, y - 3); g.textAlign = "left";
    });

    label("NEAREST PRECEDENT", 452);
    g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect(x, 466, 510, 104, 10); g.fill();
    g.fillStyle = "#274c6b"; g.font = "700 22px 'IBM Plex Mono', monospace";
    g.fillText(`${lot.case.case_id} · ${Math.round(lot.case.similarity * 100)}% similar`, x + 18, 504);
    g.fillStyle = "#425466"; g.font = "400 18px 'DM Sans', sans-serif";
    let line = "", ly = 536;
    for (const w of lot.case.confirmed_root_cause.split(" ")) {
      if (g.measureText(line + w).width > 470) { g.fillText(line, x + 18, ly); line = ""; ly += 25; }
      line += w + " ";
    }
    g.fillText(line, x + 18, ly);
  });
}

export class FabScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  private wafers: { group: THREE.Group; offset: number }[] = [];
  private beltTex = beltTexture();
  private disposables: { dispose: () => void }[] = [];
  private frame = 0;
  private last = performance.now();
  private elapsed = 0;
  private stackGreen: THREE.MeshStandardMaterial;
  private updateRoom: (elapsed: number) => void;
  private resizeObs: ResizeObserver;
  // camera flight between stops
  private pose: Pose = { pos: STOPS[0].pos.clone(), look: STOPS[0].look.clone(), shift: STOPS[0].shift };
  private from: Pose = this.pose;
  private to: Pose = STOPS[0];
  private flightStart = -1;

  constructor(private canvas: HTMLCanvasElement, wafers: LandingWafer[], lot: LandingLot) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.localClippingEnabled = true;
    this.renderer = r;
    const own = <T extends { dispose: () => void }>(x: T) => { this.disposables.push(x); return x; };

    const s = this.scene;
    s.background = own(skyTexture());
    s.fog = new THREE.Fog(0xdde1e6, 34, 80);
    // A neutral studio room lights the scene at once; the warehouse HDRI
    // replaces it as soon as it has loaded, for real-world reflections.
    const pmrem = own(new THREE.PMREMGenerator(r));
    s.environment = own(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    s.environmentIntensity = 0.9;
    new HDRLoader().load("/landing/empty_warehouse_01_1k.hdr", (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      s.environment = own(pmrem.fromEquirectangular(hdr).texture);
      s.environmentIntensity = 0.85;
      hdr.dispose();
    });

    s.add(new THREE.HemisphereLight(0xf4f6f8, 0xb9bec4, 0.5));
    const sun = new THREE.DirectionalLight(0xfffbf2, 1.5);
    sun.position.set(6, 18, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    // wide enough to cover the tool bay behind the line as well
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 20, bottom: -20, near: 1, far: 60 });
    sun.shadow.radius = 5;
    sun.shadow.bias = -0.0004;
    s.add(sun);

    const mat = (color: number, rough = 0.5, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
      own(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number],
                 parent: THREE.Object3D = s, shadow = true) => {
      const mesh = new THREE.Mesh(own(geo), m);
      mesh.position.set(...pos);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const anodised = mat(0xb4b9c0, 0.36, 0.85);
    const steel = mat(0xd9dde2, 0.22, 1);
    const paint = mat(0xe6e7e3, 0.62, 0.0);
    const charcoal = mat(0x3a3f46, 0.7, 0.1);

    // raised cleanroom floor
    const floor = add(new THREE.PlaneGeometry(140, 140), mat(0xffffff, 0.38, 0, { map: own(floorTexture()) }),
                      [0, 0, 0], s, false);
    floor.rotation.x = -Math.PI / 2;

    // conveyor: anodised frame, side guides, black rubber belt, steel rollers, legs
    add(new RoundedBoxGeometry(31, 0.42, 2.8, 4, 0.08), anodised, [0, BELT_Y - 0.27, 0]);
    for (const z of [-1.36, 1.36])
      add(new RoundedBoxGeometry(31, 0.12, 0.08, 2, 0.03), anodised, [0, BELT_Y + 0.05, z]);
    const beltMat = own(new THREE.MeshStandardMaterial({ map: own(this.beltTex), roughness: 0.82, metalness: 0 }));
    add(new THREE.BoxGeometry(30.6, 0.04, 2.5), beltMat, [0, BELT_Y - 0.02, 0], s, false);
    for (const x of [-15.3, 15.3]) {
      const roller = add(new THREE.CylinderGeometry(0.26, 0.26, 2.6, 32), steel, [x, BELT_Y - 0.24, 0]);
      roller.rotation.x = Math.PI / 2;
    }
    for (let x = -14; x <= 14; x += 4) for (const z of [-1.15, 1.15]) {
      add(new THREE.BoxGeometry(0.12, BELT_Y - 0.48, 0.12), anodised, [x, (BELT_Y - 0.48) / 2, z]);
      add(new THREE.CylinderGeometry(0.11, 0.13, 0.05, 16), charcoal, [x, 0.025, z]);
    }

    // probe tester: two towers on dark plinths and a bridge the belt runs under
    for (const z of [-1.95, 1.95]) {
      add(new RoundedBoxGeometry(4.4, 0.4, 1.2, 3, 0.06), charcoal, [0, 0.2, z]);
      add(new RoundedBoxGeometry(4.2, 2.9, 1.0, 5, 0.12), paint, [0, 1.85, z]);
    }
    add(new RoundedBoxGeometry(4.2, 1.25, 4.9, 5, 0.14), paint, [0, 2.75, 0]);
    // Front control screen, e-stop and a white LED bar above them. The cabinet
    // face is at z = 2.45; everything mounted on it stands clearly proud of it,
    // because coplanar surfaces z-fight (flicker) as the camera drifts.
    add(new RoundedBoxGeometry(1.64, 1.08, 0.05, 2, 0.02), charcoal, [-0.9, 1.75, 2.475], s, false);
    add(new THREE.PlaneGeometry(1.5, 0.94),
        own(new THREE.MeshBasicMaterial({ map: own(testerScreen(lot, wafers[0])), toneMapped: false })),
        [-0.9, 1.75, 2.505], s, false);
    const estopBase = add(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 24), mat(0xe8c22a, 0.5), [1.3, 1.5, 2.475]);
    estopBase.rotation.x = Math.PI / 2;
    const estop = add(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 24), mat(0xc4231c, 0.4), [1.3, 1.5, 2.53]);
    estop.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(3.8, 0.05, 0.03), mat(0xffffff, 0.3, 0, { emissive: 0xdfefff, emissiveIntensity: 1.4 }),
        [0, 2.55, 2.475], s, false);
    // The rest of the room (tool bay, back wall, overhead transport, stocker,
    // floor markings) is built in fabProps.ts with these same helpers.
    const kit: Kit = { scene: s, own, mat, add, m: { anodised, steel, paint, charcoal } };
    // stack light: the universal "tool running" signal on a fab floor
    this.stackGreen = stackLight(kit, [-1.6, 3.38, 1.9], "green");
    this.updateRoom = buildRoom(kit);

    // probe card across the belt at the probe line: bar, PCB, a row of needles
    const probeY = 1.62;
    add(new RoundedBoxGeometry(0.42, 0.26, 2.9, 4, 0.08), steel, [SCAN_X, probeY, 0]);
    for (const z of [-1.25, 1.25])
      add(new RoundedBoxGeometry(0.16, 0.5, 0.16, 2, 0.05), steel, [SCAN_X - 0.12, probeY + 0.36, z]);
    add(new THREE.BoxGeometry(0.36, 0.03, 2.6), mat(0x23503a, 0.55, 0.1), [SCAN_X, probeY - 0.145, 0], s, false);
    const needleTop = probeY - 0.16, needleBottom = BELT_Y + 0.07;
    const COUNT = 26;
    const needles = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.005, 0.012, needleTop - needleBottom, 6)), steel, COUNT);
    const tips = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.018, 10, 8)),
                                         own(new THREE.MeshBasicMaterial({ color: 0x9fd2ff })), COUNT);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < COUNT; i++) {
      const z = -1.1 + (2.2 * i) / (COUNT - 1);
      needles.setMatrixAt(i, m4.makeTranslation(SCAN_X, (needleTop + needleBottom) / 2, z));
      tips.setMatrixAt(i, m4.makeTranslation(SCAN_X, needleBottom, z));
    }
    s.add(needles, tips);

    // wafers: mirror-polished silicon with the die grid patterned into it; the
    // test result is a layer clipped to the part that has passed the probes.
    const discGeo = own(new THREE.CylinderGeometry(1.15, 1.15, 0.04, 128));
    const faceGeo = own(new THREE.CircleGeometry(1.1, 128));
    const silicon = own(new THREE.MeshPhysicalMaterial({
      // Polished silicon reads dark grey-blue; a full-strength mirror of the bright
      // warehouse sky turned the wafers white, so its reflection is held back.
      // The HDRI's ceiling is far brighter than 1.0, so a sharp, full-strength
      // mirror turned the far wafers white. A touch of roughness spreads those
      // highlights and a lower environment weight keeps the silicon dark.
      color: 0x5f6875, metalness: 1, roughness: 0.26, iridescence: 0.25, iridescenceIOR: 1.45,
      iridescenceThicknessRange: [150, 450], envMapIntensity: 0.3,
    }));
    const clip = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -SCAN_X)];
    const looks = wafers.map((w) => ({
      // decal layers on the wafer face: a depth bias keeps them from z-fighting it
      pattern: own(new THREE.MeshStandardMaterial({ map: own(patternTexture(w.grid)), transparent: true,
                                                    metalness: 0.6, roughness: 0.25, depthWrite: false,
                                                    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
      result: own(new THREE.MeshStandardMaterial({
        map: own(resultTexture(w.grid)), transparent: true, roughness: 0.45, depthWrite: false,
        emissive: 0xffffff, emissiveIntensity: 0.18, clippingPlanes: clip,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      })),
    }));
    for (let i = 0; i < N_WAFERS; i++) {
      const group = new THREE.Group();
      const disc = new THREE.Mesh(discGeo, silicon);
      disc.castShadow = true;
      const look = looks[i % looks.length];
      const pattern = new THREE.Mesh(faceGeo, look.pattern);
      pattern.rotation.x = -Math.PI / 2;
      pattern.position.y = 0.024;
      const result = new THREE.Mesh(faceGeo, look.result);
      result.rotation.x = -Math.PI / 2;
      result.position.y = 0.028;
      group.add(disc, pattern, result);
      s.add(group);
      this.wafers.push({ group, offset: i * SPACING });
    }

    // engineer's desk beside the line
    add(new RoundedBoxGeometry(5.6, 0.08, 3.6, 3, 0.03), mat(0xf1f1ee, 0.5), [9.2, 1.34, 6.4]);
    for (const [dx, dz] of [[-2.55, -1.55], [2.55, -1.55], [-2.55, 1.55], [2.55, 1.55]])
      add(new THREE.BoxGeometry(0.08, 1.3, 0.08), anodised, [9.2 + dx, 0.65, 6.4 + dz]);

    // laptop: aluminium shell, black keys, trackpad, bezel, screen
    const laptop = new THREE.Group();
    laptop.position.set(9.0, 1.38, 6.5);
    laptop.rotation.y = -0.55;
    s.add(laptop);
    const shell = mat(0xc9cdd3, 0.3, 0.9);
    add(new RoundedBoxGeometry(3.2, 0.09, 2.2, 3, 0.04), shell, [0, 0.045, 0], laptop);
    add(new THREE.BoxGeometry(2.86, 0.006, 1.12), mat(0x15171a, 0.8), [0, 0.092, -0.45], laptop, false);
    const keyGeo = own(new RoundedBoxGeometry(0.165, 0.03, 0.15, 2, 0.02));
    const keyMat = mat(0x24272b, 0.62, 0.05);
    const keyPos: [number, number, number][] = [];
    [14, 14, 13, 12, 12].forEach((n, row) => {
      const w = 0.19, start = -((n - 1) * w) / 2;
      for (let k = 0; k < n; k++) keyPos.push([start + k * w, 0.105, -0.9 + row * 0.18]);
    });
    for (const dx of [-0.9, -0.71, 0.71, 0.9]) keyPos.push([dx, 0.105, -0.9 + 5 * 0.18]);   // modifier row
    const keys = new THREE.InstancedMesh(keyGeo, keyMat, keyPos.length);
    keyPos.forEach((p, i) => keys.setMatrixAt(i, m4.makeTranslation(...p)));
    keys.castShadow = true;
    laptop.add(keys);
    add(new RoundedBoxGeometry(0.95, 0.03, 0.15, 2, 0.02), keyMat, [0, 0.105, -0.9 + 5 * 0.18], laptop);   // space bar
    add(new RoundedBoxGeometry(1.2, 0.01, 0.72, 2, 0.004), mat(0xbfc4ca, 0.25, 0.85), [0, 0.092, 0.62], laptop, false);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.09, -1.08);
    hinge.rotation.x = -0.3;
    laptop.add(hinge);
    add(new RoundedBoxGeometry(3.2, 2.08, 0.06, 3, 0.04), shell, [0, 1.04, 0], hinge);
    add(new THREE.BoxGeometry(3.12, 2.0, 0.006), mat(0x0b0c0e, 0.35), [0, 1.04, 0.033], hinge, false);
    add(new THREE.PlaneGeometry(2.94, 1.84),
        own(new THREE.MeshBasicMaterial({ map: own(dashboardTexture(wafers[0], lot)), toneMapped: false })),
        [0, 1.06, 0.045], hinge, false);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }

  /** Fly the camera to stop i over MOVE_S seconds; `instant` jumps there. */
  goTo(i: number, instant = false) {
    const to = STOPS[Math.max(0, Math.min(STOPS.length - 1, i))];
    if (to === this.to && !instant) return;
    this.from = { pos: this.pose.pos.clone(), look: this.pose.look.clone(), shift: this.pose.shift };
    this.to = to;
    if (instant) {
      this.pose = { pos: to.pos.clone(), look: to.look.clone(), shift: to.shift };
      this.flightStart = -1;
    } else {
      this.flightStart = performance.now();
    }
  }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 48 : 32;     // narrow screens: wider lens
    this.camera.updateProjectionMatrix();
  }

  private placeCamera(now: number) {
    if (this.flightStart >= 0) {
      const u = Math.min(1, (now - this.flightStart) / (MOVE_S * 1000));
      const e = easeInOut(u);
      this.pose = {
        pos: this.from.pos.clone().lerp(this.to.pos, e),
        look: this.from.look.clone().lerp(this.to.look, e),
        shift: this.from.shift + (this.to.shift - this.from.shift) * e,
      };
      if (u >= 1) this.flightStart = -1;
    }
    // a slow handheld drift keeps the shot alive between moves
    const t = this.elapsed;
    this.camera.position.set(
      this.pose.pos.x + Math.sin(t * 0.21) * 0.22,
      this.pose.pos.y + Math.sin(t * 0.17) * 0.1,
      this.pose.pos.z + Math.cos(t * 0.19) * 0.18,
    );
    this.camera.lookAt(this.pose.look);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const shift = w / h < 1 ? 0 : this.pose.shift;   // narrow screens: subject centred
    if (w && h) this.camera.setViewOffset(w, h, shift * w, 0, w, h);
  }

  // Adaptive quality: if the first frames are slow, drop shadows and resolution
  // rather than stutter. Checked once, after the scene has warmed up.
  private frameTimes: number[] = [];
  private degraded = false;
  private watchQuality(dt: number) {
    if (this.degraded || this.frameTimes.length >= 90) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.slice(30).reduce((a, b) => a + b, 0) / 60;
    if (avg > 1 / 45) {
      this.degraded = true;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
      this.resize();
    }
  }

  private loop(now: number) {
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;
    // The line runs continuously, whatever the page is doing: it is the subject.
    this.elapsed += dt;
    this.watchQuality(dt);
    this.placeCamera(now);

    const travel = (this.elapsed * SPEED) % LOOP;
    for (const w of this.wafers) {
      const x = ((w.offset + travel) % LOOP) - LOOP / 2;
      const edge = Math.max(0, Math.abs(x) - 13.6);       // dip into the rollers at the ends
      w.group.position.set(x, BELT_Y + 0.026 - edge * 0.6, 0);
      w.group.scale.setScalar(Math.max(0.001, 1 - edge * 0.55));
    }
    this.beltTex.offset.x = -(this.elapsed * SPEED) / (30.6 / 16);
    this.stackGreen.emissiveIntensity = 1.3 + 0.3 * Math.sin(this.elapsed * 2.2);
    this.updateRoom(this.elapsed);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObs.disconnect();
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
