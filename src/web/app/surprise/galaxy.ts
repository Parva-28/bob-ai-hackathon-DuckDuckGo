/**
 * The wafer galaxy: all 811,457 WM-811K wafers placed by UMAP over the CNN's own
 * embedding, so wafers the model sees as alike sit together.
 *
 * Rendered as additive density on a 2D canvas, not WebGL: one pass over the points
 * accumulates colour and weight per pixel, then a tone map keeps each pixel's hue
 * (the weighted mean colour) and turns density into brightness. ~20 ms a frame.
 * Zoom in far enough and the dots are replaced by the actual wafer maps.
 */

export const CLASSES = ["Center", "Donut", "Edge-Loc", "Edge-Ring", "Local", "Random", "Scratch", "Near-full", "None"];
export const NONE = 8;

/** Reference dark categorical palette, validated against #0a0e15 (all checks pass). */
export const CLASS_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767", "#56627a"];
export const CLASS_RGB = CLASS_COLORS.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));

export type Points = {
  n: number;
  x: Float32Array;
  y: Float32Array;
  pred: Uint8Array;
  conf: Uint8Array;   // 0-255
  gt: Uint8Array;     // 255 = never labeled
  fam: Uint8Array;    // 255 = no unnamed-pattern family
  clean: Uint8Array;  // 1 = under 1% of dies fail
};

export function parsePoints(buf: ArrayBuffer): Points {
  const b = new Uint8Array(buf);
  const n = b.length / 8;
  const p: Points = {
    n,
    x: new Float32Array(n), y: new Float32Array(n),
    pred: new Uint8Array(n), conf: new Uint8Array(n), gt: new Uint8Array(n), fam: new Uint8Array(n),
    clean: new Uint8Array(n),
  };
  for (let i = 0, o = 0; i < n; i++, o += 8) {
    p.x[i] = (b[o] | (b[o + 1] << 8)) / 65535;
    p.y[i] = 1 - (b[o + 2] | (b[o + 3] << 8)) / 65535;
    p.pred[i] = b[o + 4];
    p.conf[i] = b[o + 5];
    p.gt[i] = b[o + 6];
    const f = b[o + 7] & 127;
    p.fam[i] = f === 127 ? 255 : f;
    p.clean[i] = b[o + 7] >> 7;
  }
  return p;
}

/** Packed 2-bit 64×64 map -> canvas: off-wafer transparent, pass dim, fail in `fail`. */
export function waferCanvas(bytes: Uint8Array, offset: number, fail: number[], pass = [46, 62, 88, 235]) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(64, 64);
  for (let i = 0; i < 4096; i++) {
    const v = (bytes[offset + (i >> 2)] >> ((i & 3) * 2)) & 3;
    const k = i * 4;
    if (v === 2) {
      img.data[k] = fail[0]; img.data[k + 1] = fail[1]; img.data[k + 2] = fail[2]; img.data[k + 3] = 255;
    } else if (v === 1) {
      img.data[k] = pass[0]; img.data[k + 1] = pass[1]; img.data[k + 2] = pass[2]; img.data[k + 3] = pass[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function unpackMap(bytes: Uint8Array, offset = 0): Uint8Array {
  const m = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) m[i] = (bytes[offset + (i >> 2)] >> ((i & 3) * 2)) & 3;
  return m;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const GRID = 512;
const TILE_LIMIT = 2500;
const TILE_CACHE = 3000;

type Fly = { t0: number; ms: number; from: [number, number, number]; to: [number, number, number]; bump: number };

export class Galaxy {
  readonly pts: Points;
  readonly colR: Uint8Array;
  readonly colG: Uint8Array;
  readonly colB: Uint8Array;
  readonly alpha: Float32Array;

  cx = 0.5;
  cy = 0.5;
  /** Home view: frames the 1st-99th percentile of points, ignoring UMAP's sparse outlier halo. */
  private home = { x: 0.5, y: 0.5, w: 1, h: 1 };
  zoom = 1;
  fitZoom = 1;
  W = 1;
  H = 1;
  dpr = 1;

  /** Called after the point layer, in device pixels; the page draws labels and rings here. */
  overlay: ((ctx: CanvasRenderingContext2D, g: Galaxy, now: number) => void) | null = null;
  onHover: ((id: number, x: number, y: number) => void) | null = null;
  onPick: ((id: number) => void) | null = null;
  onCamera: (() => void) | null = null;
  animate = false;          // keep redrawing overlays (pulsing rings)
  tilesShown = 0;

  private ctx: CanvasRenderingContext2D;
  private layer = document.createElement("canvas");
  private layerCtx: CanvasRenderingContext2D;
  private acc = new Float32Array(4);
  private img: ImageData | null = null;
  private dirty = true;
  private raf = 0;
  private fly: Fly | null = null;
  private introStart = 0;
  private introX: Float32Array;
  private introY: Float32Array;
  private introDelay: Float32Array;
  private introDone = false;
  private cellStart = new Uint32Array(GRID * GRID + 1);
  private cellIds: Uint32Array;
  private visible: number[] = [];
  private tiles = new Map<number, HTMLCanvasElement>();
  private pending = new Set<number>();
  private queue: number[] = [];
  private fetchTimer = 0;
  private ro: ResizeObserver;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;

  constructor(private canvas: HTMLCanvasElement, pts: Points) {
    this.pts = pts;
    this.ctx = canvas.getContext("2d")!;
    this.layerCtx = this.layer.getContext("2d")!;
    this.colR = new Uint8Array(pts.n);
    this.colG = new Uint8Array(pts.n);
    this.colB = new Uint8Array(pts.n);
    this.alpha = new Float32Array(pts.n);

    // Spatial hash for hover picking.
    const cell = new Uint32Array(pts.n);
    const counts = this.cellStart;
    for (let i = 0; i < pts.n; i++) {
      const c = Math.min(GRID - 1, (pts.x[i] * GRID) | 0) * GRID + Math.min(GRID - 1, (pts.y[i] * GRID) | 0);
      cell[i] = c;
      counts[c + 1]++;
    }
    for (let c = 0; c < GRID * GRID; c++) counts[c + 1] += counts[c];
    const fill = counts.slice(0, GRID * GRID);
    this.cellIds = new Uint32Array(pts.n);
    for (let i = 0; i < pts.n; i++) this.cellIds[fill[cell[i]]++] = i;

    const pct = (a: Float32Array) => {
      const s = Float32Array.from({ length: 20000 }, (_, k) => a[Math.floor((k / 20000) * a.length)]).sort();
      return [s[200], s[19800]];
    };
    const [x0, x1] = pct(pts.x), [y0, y1] = pct(pts.y);
    this.home = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
    this.cx = this.home.x;
    this.cy = this.home.y;
    const R = 0.46 * Math.min(this.home.w, this.home.h);

    // Intro: every wafer starts on one giant wafer — a phyllotaxis disc with the
    // rarest classes at the centre — then flows out to where the model puts it.
    const byClass = Array.from({ length: 9 }, () => [] as number[]);
    for (let i = 0; i < pts.n; i++) byClass[pts.pred[i]].push(i);
    const order = byClass.map((ids, c) => [ids.length, c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
    this.introX = new Float32Array(pts.n);
    this.introY = new Float32Array(pts.n);
    this.introDelay = new Float32Array(pts.n);
    let k = 0;
    for (const c of order) {
      for (const i of byClass[c]) {
        const r = Math.sqrt((k + 0.5) / pts.n) * R;
        const th = k * 2.399963229728653;
        this.introX[i] = this.home.x + r * Math.cos(th);
        this.introY[i] = this.home.y + r * Math.sin(th);
        this.introDelay[i] = (r / R) * 0.35;
        k++;
      }
    }

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.bindInput();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
  }

  startIntro() {
    this.introStart = performance.now();
    this.introDone = false;
    this.invalidate();
  }

  /** Recompute per-point colour and weight; `fn` writes [r, g, b, alpha] for point i. */
  restyle(fn: (i: number, out: number[]) => void) {
    const o = [0, 0, 0, 0];
    for (let i = 0; i < this.pts.n; i++) {
      fn(i, o);
      this.colR[i] = o[0]; this.colG[i] = o[1]; this.colB[i] = o[2]; this.alpha[i] = o[3];
    }
    this.invalidate();
  }

  get zRel() {
    return this.zoom / this.fitZoom;
  }

  toScreen(x: number, y: number): [number, number] {
    return [(x - this.cx) * this.zoom + this.W / 2, (y - this.cy) * this.zoom + this.H / 2];
  }

  toData(sx: number, sy: number): [number, number] {
    return [(sx - this.W / 2) / this.zoom + this.cx, (sy - this.H / 2) / this.zoom + this.cy];
  }

  /** Camera flight that pulls back mid-way when the hop is long (van Wijk & Nuij style). */
  flyTo(x: number, y: number, zRel: number, ms = 1500) {
    const from: [number, number, number] = [this.cx, this.cy, Math.log(this.zoom)];
    const to: [number, number, number] = [x, y, Math.log(this.fitZoom * zRel)];
    const px = Math.hypot(x - this.cx, y - this.cy) * Math.min(this.zoom, this.fitZoom * zRel);
    const bump = Math.max(0, Math.log(px / (Math.min(this.W, this.H) * 0.4)));
    this.fly = { t0: performance.now(), ms, from, to, bump };
    this.invalidate();
  }

  /** Fly to the home view; `shiftCss` moves it right by that many CSS px (to clear a panel). */
  goHome(ms = 1200, zRel = 1, shiftCss = 0) {
    const z = this.fitZoom * zRel;
    this.flyTo(this.home.x - (shiftCss * this.dpr) / z, this.home.y, zRel, ms);
  }

  invalidate() {
    this.dirty = true;
    this.kick();
  }

  kick() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.max(1, Math.round(r.width * this.dpr));
    const H = Math.max(1, Math.round(r.height * this.dpr));
    const firstFit = this.W === 1;
    const rel = this.zRel;
    this.W = this.canvas.width = this.layer.width = W;
    this.H = this.canvas.height = this.layer.height = H;
    // Fit the home box into the space between the side panels (when they are beside it).
    const rails = r.width > 1100 ? 2 * 332 * this.dpr : 0;
    const top = 70 * this.dpr, bottom = 56 * this.dpr;
    this.fitZoom = Math.min((W - rails) / this.home.w, (H - top - bottom) / this.home.h) * 0.9;
    this.zoom = firstFit ? this.fitZoom : this.fitZoom * rel;
    this.acc = new Float32Array(W * H * 4);
    this.img = this.layerCtx.createImageData(W, H);
    this.invalidate();
  }

  private frame(now: number) {
    this.raf = 0;
    if (this.fly) {
      const f = this.fly;
      const t = Math.min(1, (now - f.t0) / f.ms);
      const s = ease(t);
      this.cx = f.from[0] + (f.to[0] - f.from[0]) * s;
      this.cy = f.from[1] + (f.to[1] - f.from[1]) * s;
      this.zoom = Math.exp(f.from[2] + (f.to[2] - f.from[2]) * s - f.bump * Math.sin(Math.PI * s));
      this.dirty = true;
      if (t >= 1) this.fly = null;
      this.onCamera?.();
    }
    const introT = this.introDone ? 1 : (now - this.introStart) / 2600;
    if (!this.introDone) {
      this.dirty = true;
      if (introT >= 1.4) this.introDone = true;
    }
    if (this.dirty) {
      this.renderPoints(introT);
      this.dirty = false;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.drawImage(this.layer, 0, 0);
    this.drawTiles();
    this.overlay?.(ctx, this, now);
    if (this.fly || !this.introDone || this.animate) this.kick();
  }

  private renderPoints(introT: number) {
    const { W, H, acc, pts } = this;
    const img = this.img!;
    acc.fill(0);
    const z = this.zoom;
    const ox = W / 2 - this.cx * z;
    const oy = H / 2 - this.cy * z;
    const zr = this.zRel;
    const size = zr < 3 ? 1 : zr < 12 ? 2 : 3;
    const collect = zr >= 4;
    const vis: number[] = [];
    const intro = !this.introDone;
    const { x: X, y: Y, } = pts;
    const { colR: R, colG: G, colB: B, alpha: A, introX: IX, introY: IY, introDelay: ID } = this;

    for (let i = 0; i < pts.n; i++) {
      const a = A[i];
      if (a === 0) continue;
      let x = X[i], y = Y[i];
      if (intro) {
        const t = Math.max(0, Math.min(1, (introT - ID[i]) / 0.9));
        const e = ease(t);
        x = IX[i] + (x - IX[i]) * e;
        y = IY[i] + (y - IY[i]) * e;
      }
      const fx = x * z + ox, fy = y * z + oy;
      if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
      const sx = fx | 0, sy = fy | 0;
      if (size === 1) {
        const k = (sy * W + sx) * 4;
        acc[k] += R[i] * a; acc[k + 1] += G[i] * a; acc[k + 2] += B[i] * a; acc[k + 3] += a;
      } else {
        for (let dy = 0; dy < size && sy + dy < H; dy++) {
          for (let dx = 0; dx < size && sx + dx < W; dx++) {
            const k = ((sy + dy) * W + sx + dx) * 4;
            acc[k] += R[i] * a; acc[k + 1] += G[i] * a; acc[k + 2] += B[i] * a; acc[k + 3] += a;
          }
        }
      }
      // File order is lot order, not layout order, so the first TILE_LIMIT visible
      // wafers are an even spatial sample when there are more on screen than that.
      if (collect && vis.length < TILE_LIMIT && a > 0.2) vis.push(i);
    }

    // Tone map: hue = weighted mean colour, brightness = density, white-hot cores.
    const d = img.data;
    const gain = 0.7;
    for (let p = 0, k = 0; p < W * H; p++, k += 4) {
      const n = acc[k + 3];
      if (n === 0) {
        d[k + 3] = 0;
        continue;
      }
      const inv = 1 / n;
      const core = n > 6 ? Math.min(1, (n - 6) / 260) * 0.55 : 0;
      d[k] = acc[k] * inv + (255 - acc[k] * inv) * core;
      d[k + 1] = acc[k + 1] * inv + (255 - acc[k + 1] * inv) * core;
      d[k + 2] = acc[k + 2] * inv + (255 - acc[k + 2] * inv) * core;
      d[k + 3] = 255 * (1 - Math.exp(-n * gain));
    }
    this.layerCtx.putImageData(img, 0, 0);
    this.visible = vis;
  }

  /** Semantic zoom: once few enough wafers are on screen, show each one's real map. */
  private drawTiles() {
    const vis = this.visible;
    this.tilesShown = 0;
    if (!vis.length) return;
    const size = Math.min(72, Math.max(9, 3.2 * Math.sqrt(this.zRel))) * this.dpr;
    const missing: number[] = [];
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    for (const id of vis) {
      const t = this.tiles.get(id);
      if (!t) {
        if (!this.pending.has(id)) missing.push(id);
        continue;
      }
      const [sx, sy] = this.toScreen(this.pts.x[id], this.pts.y[id]);
      ctx.drawImage(t, sx - size / 2, sy - size / 2, size, size);
      this.tilesShown++;
    }
    if (missing.length) this.requestTiles(missing);
  }

  getTile(id: number) {
    const t = this.tiles.get(id);
    if (!t) this.requestTiles([id]);
    return t;
  }

  requestTiles(ids: number[]) {
    for (const id of ids) {
      if (this.pending.has(id) || this.tiles.has(id)) continue;
      this.pending.add(id);
      this.queue.push(id);
    }
    if (!this.fetchTimer) this.fetchTimer = window.setTimeout(() => this.flushTiles(), 60);
  }

  private async flushTiles() {
    this.fetchTimer = 0;
    const batch = this.queue.splice(0, 1500);
    if (!batch.length) return;
    try {
      const res = await fetch("/surprise/api/wafers", { method: "POST", body: new Uint32Array(batch) });
      const bytes = new Uint8Array(await res.arrayBuffer());
      batch.forEach((id, j) => {
        this.tiles.set(id, waferCanvas(bytes, j * 1024, CLASS_RGB[this.pts.pred[id]]));
        this.pending.delete(id);
      });
      while (this.tiles.size > TILE_CACHE) this.tiles.delete(this.tiles.keys().next().value!);
    } catch {
      batch.forEach((id) => this.pending.delete(id));
    }
    if (this.queue.length) this.fetchTimer = window.setTimeout(() => this.flushTiles(), 0);
    this.kick();
  }

  /** Nearest visible wafer within ~10 CSS px of a screen point, or -1. */
  pick(sx: number, sy: number): number {
    const [x, y] = this.toData(sx, sy);
    const r = (10 * this.dpr) / this.zoom;
    const c0 = Math.max(0, ((x - r) * GRID) | 0), c1 = Math.min(GRID - 1, ((x + r) * GRID) | 0);
    const r0 = Math.max(0, ((y - r) * GRID) | 0), r1 = Math.min(GRID - 1, ((y + r) * GRID) | 0);
    let best = -1, bestD = r * r;
    const { x: X, y: Y } = this.pts;
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const c = cx * GRID + cy;
        for (let j = this.cellStart[c]; j < this.cellStart[c + 1]; j++) {
          const i = this.cellIds[j];
          if (this.alpha[i] < 0.2) continue;
          const d = (X[i] - x) ** 2 + (Y[i] - y) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    return best;
  }

  private bindInput() {
    const cv = this.canvas;
    const local = (e: PointerEvent | WheelEvent) => {
      const r = cv.getBoundingClientRect();
      return [(e.clientX - r.left) * this.dpr, (e.clientY - r.top) * this.dpr] as const;
    };
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.fly = null;
      const [sx, sy] = local(e);
      const [x, y] = this.toData(sx, sy);
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      this.zoom = Math.min(this.fitZoom * 300, Math.max(this.fitZoom * 0.5, this.zoom * f));
      this.cx = x - (sx - this.W / 2) / this.zoom;
      this.cy = y - (sy - this.H / 2) / this.zoom;
      this.onCamera?.();
      this.invalidate();
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      this.fly = null;
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy, moved: false };
    });
    cv.addEventListener("pointermove", (e) => {
      if (this.drag) {
        const dx = (e.clientX - this.drag.x) * this.dpr, dy = (e.clientY - this.drag.y) * this.dpr;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        this.cx = this.drag.cx - dx / this.zoom;
        this.cy = this.drag.cy - dy / this.zoom;
        this.onCamera?.();
        this.invalidate();
        return;
      }
      const [sx, sy] = local(e);
      const id = this.pick(sx, sy);
      this.onHover?.(id, e.clientX, e.clientY);
    });
    cv.addEventListener("pointerup", (e) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) {
        const [sx, sy] = local(e);
        this.onPick?.(this.pick(sx, sy));
      }
    });
    cv.addEventListener("pointerleave", () => this.onHover?.(-1, 0, 0));
  }
}
