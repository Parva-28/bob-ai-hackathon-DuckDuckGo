/**
 * Wafer: a silicon wafer with a flat, its dies standing as low pillars. At
 * rest the dies round the rim stand up, heavier on one side: an Edge-Ring
 * failure, the thumbnail. The pointer drops a defect cluster on the ground
 * plane; dies take their height from their distance to it, each on its own
 * spring, and the read-out names the WM-811K class that cluster's place on
 * the wafer gives it. Raised dies take the bright stroke. The slider is the
 * cluster's radius, in dies.
 */
const {
  Cam, clamp, facing, fit, prism, proj, rings, unproj, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const CELL = 14, FOOT = 11, R = 76, FLAT = 61, HMAX = 28, PB = 5, A = Math.PI / 4;
const RD = 64; // the farthest die centre a die may have and still sit inside the rim

/** 1 → .31 at 42% → .09 at the edge and beyond, as in Terrain. */
const falloff = (u) =>
  u <= 0 ? 1 : u <= 0.417 ? 1 - (u / 0.417) * 0.6875 : u <= 1 ? 0.3125 - ((u - 0.417) / 0.583) * 0.2185 : 0.094;

/** A disc of radius r with its flat at distance f towards the viewer, eased into the round so no corner is sharp. */
function waferRing(r, f, n) {
  const out = [], ca = Math.cos(A), sa = Math.sin(A), w = 7;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    let u = r * Math.cos(t), v = r * Math.sin(t), nu = Math.cos(t), nv = Math.sin(t);
    const d = u * ca + v * sa, s = d - (f - w);
    if (s > 0) {
      const cut = s - w * Math.tanh(s / w);
      u -= cut * ca; v -= cut * sa;
      const m = clamp(s / w, 0, 1);
      nu = nu * (1 - m) + ca * m; nv = nv * (1 - m) + sa * m;
    }
    out.push({ u, v, nu, nv });
  }
  return out;
}

/** The WM-811K class a cluster centred at distance d from the wafer's centre would be filed under. */
const classAt = (d) => (d < 0.3 * RD ? "Center" : d > 0.8 * RD ? "Edge-Loc" : "Local");

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.96);
  const q = RD / Math.SQRT2;
  fit(C, [[R, 0, -PB], [-R, 0, -PB], [0, R, -PB], [0, -R, -PB], [-q, -q, HMAX]], 200, 166);
  const P = proj(C), front = facing(C);
  let rad = value * CELL, over = null;

  const g = mk("g", {}, svg), dies = [];
  put(solid(g), prism(P, front, waferRing(R, FLAT, 72), waferRing(R - 2.2, FLAT - 2.2, 72), -PB, 0));

  // Every die whose four corners clear the rim and the flat, appended by
  // ascending x + y: from the far side of the wafer to the near, back to front.
  const cells = [];
  for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) {
    const x0 = i * CELL + (CELL - FOOT) / 2, y0 = j * CELL + (CELL - FOOT) / 2;
    const ok = [[x0, y0], [x0 + FOOT, y0], [x0, y0 + FOOT], [x0 + FOOT, y0 + FOOT]]
      .every(([x, y]) => Math.hypot(x, y) < R - 4 && (x + y) * Math.SQRT1_2 < FLAT - 4);
    if (ok) cells.push({ i, j, x0, y0, cx: x0 + FOOT / 2, cy: y0 + FOOT / 2 });
  }
  cells.sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
  for (const c of cells) {
    // Rest: an Edge-Ring. The rim dies stand, heaviest towards the left, falling away round the wafer.
    const d = Math.hypot(c.cx, c.cy) / RD, th = Math.atan2(c.cy, c.cx);
    const h0 = 1.6 + 13 * Math.exp(-((d - 0.97) ** 2) / 0.012) * (0.78 + 0.22 * Math.cos(th - 2.3));
    const [ring, inner] = rings(c.x0, c.y0, c.x0 + FOOT, c.y0 + FOOT, 2.6, 0.9);
    dies.push({ ...c, h0, ring, inner, sp: spring(h0, { eps: 0.04 }), el: solid(g), drawn: NaN });
  }

  // A die whose spring hasn't moved keeps its paths.
  function drawDie(c) {
    const h = Math.max(0.6, c.sp.x);
    if (h === c.drawn) return;
    c.drawn = h;
    put(c.el, prism(P, front, c.ring, c.inner, 0, h));
    c.el.sil.classList.toggle("hi", h > 7.5);
  }

  const B = register(stage, (dt) => {
    let m = false;
    for (const c of dies) { if (stepS(c.sp, dt)) m = true; drawDie(c); }
    return m;
  });
  bag.add(B.unregister);

  function retarget() {
    for (const c of dies) {
      c.sp.t = over ? HMAX * falloff(Math.hypot(c.cx - over[0], c.cy - over[1]) / rad) : c.h0;
    }
    read.textContent = over ? classAt(Math.hypot(over[0], over[1])) : "rest";
    B.wake();
  }

  bag.add(pointer(stage, {
    move: (p) => {
      // The ground plane never moves, so the hit test never chases the dies (rule 01).
      const w = unproj(C, p[0], p[1], 0);
      const d = Math.hypot(w[0], w[1]);
      over = d < R && (w[0] + w[1]) * Math.SQRT1_2 < FLAT ? (d > RD ? [(w[0] * RD) / d, (w[1] * RD) / d] : w) : null;
      retarget();
    },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { rad = v * CELL; if (over) retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "wafer",
  means: "A wafer's dies rise where the pointer drops a defect cluster; where it lands decides its class.",
  rules: [1, 3, 5, 9],
  range: [1.6, 2.6, 3.8],
  mount,
});
