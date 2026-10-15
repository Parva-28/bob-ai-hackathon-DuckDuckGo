/**
 * WaferCNN forward pass in plain TypeScript, so the sketch pad classifies in the
 * browser with no server round-trip and no ML runtime.
 *
 * screen_all.py exports the trained checkpoint with every BatchNorm folded into
 * its conv (eval-mode BN is an affine map, so this is exact), as one float32 blob
 * read in the order model.json lists. ~58M multiply-adds per pass.
 */

type Layer = { name: string; out: number; in: number; k: number; stride: number; pad: number };
type Meta = { layers: Layer[]; fc: [number, number]; pca: [number, number]; pca_scale: number };

type Conv = Layer & { w: Float32Array; b: Float32Array };
type Tensor = { d: Float32Array; c: number; h: number; w: number };

export type NetOutput = { probs: Float32Array; feature: Float32Array };

export class WaferNet {
  private convs = new Map<string, Conv>();
  private fcW!: Float32Array;
  private fcB!: Float32Array;
  private pcaMean!: Float32Array;
  private pcaComp!: Float32Array;
  readonly pcaScale: number;

  constructor(meta: Meta, blob: Float32Array) {
    let o = 0;
    const take = (n: number) => blob.subarray(o, (o += n));
    for (const l of meta.layers) {
      const w = take(l.out * l.in * l.k * l.k);
      this.convs.set(l.name, { ...l, w, b: take(l.out) });
    }
    this.fcW = take(meta.fc[0] * meta.fc[1]);
    this.fcB = take(meta.fc[0]);
    this.pcaMean = take(meta.pca[1]);
    this.pcaComp = take(meta.pca[0] * meta.pca[1]);
    this.pcaScale = meta.pca_scale;
  }

  static async load(base = "/surprise"): Promise<WaferNet> {
    const [meta, buf] = await Promise.all([
      fetch(`${base}/model.json`).then((r) => r.json()),
      fetch(`${base}/model.bin`).then((r) => r.arrayBuffer()),
    ]);
    return new WaferNet(meta, new Float32Array(buf));
  }

  private conv(x: Tensor, name: string, relu: boolean, add?: Tensor): Tensor {
    const L = this.convs.get(name)!;
    const { k, stride: s, pad: p } = L;
    const H = x.h, W = x.w;
    const H2 = Math.floor((H + 2 * p - k) / s) + 1;
    const W2 = Math.floor((W + 2 * p - k) / s) + 1;
    const plane = H2 * W2;
    const y = new Float32Array(L.out * plane);
    for (let o = 0; o < L.out; o++) {
      const yo = o * plane;
      y.fill(L.b[o], yo, yo + plane);
      for (let c = 0; c < L.in; c++) {
        const xc = c * H * W;
        for (let ky = 0; ky < k; ky++) {
          const oyMin = Math.max(0, Math.ceil((p - ky) / s));
          const oyMax = Math.min(H2 - 1, Math.floor((H - 1 + p - ky) / s));
          for (let kx = 0; kx < k; kx++) {
            const wv = L.w[((o * L.in + c) * k + ky) * k + kx];
            if (wv === 0) continue;
            const oxMin = Math.max(0, Math.ceil((p - kx) / s));
            const oxMax = Math.min(W2 - 1, Math.floor((W - 1 + p - kx) / s));
            for (let oy = oyMin; oy <= oyMax; oy++) {
              const xr = xc + (oy * s - p + ky) * W - p + kx;
              const yr = yo + oy * W2;
              for (let ox = oxMin; ox <= oxMax; ox++) y[yr + ox] += wv * x.d[xr + ox * s];
            }
          }
        }
      }
    }
    if (add) for (let i = 0; i < y.length; i++) y[i] += add.d[i];
    if (relu) for (let i = 0; i < y.length; i++) if (y[i] < 0) y[i] = 0;
    return { d: y, c: L.out, h: H2, w: W2 };
  }

  /** One pass over a 64×64 map with values in {0, 1, 2}. */
  private once(map: ArrayLike<number>): NetOutput {
    const d = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) d[i] = map[i] / 2;
    let x: Tensor = this.conv({ d, c: 1, h: 64, w: 64 }, "stem", true);
    for (let i = 1; i <= 4; i++) {
      const a = this.conv(x, `l${i}.c1`, true);
      const sc = this.conv(x, `l${i}.sc`, false);
      x = this.conv(a, `l${i}.c2`, true, sc);
    }
    const plane = x.h * x.w;
    const feature = new Float32Array(x.c);
    for (let c = 0; c < x.c; c++) {
      let s = 0;
      for (let i = 0; i < plane; i++) s += x.d[c * plane + i];
      feature[c] = s / plane;
    }
    const logits = new Float32Array(9);
    for (let j = 0; j < 9; j++) {
      let s = this.fcB[j];
      for (let c = 0; c < 128; c++) s += this.fcW[j * 128 + c] * feature[c];
      logits[j] = s;
    }
    const m = Math.max(...logits);
    let z = 0;
    const probs = logits.map((v) => (z += Math.exp(v - m), Math.exp(v - m)));
    for (let j = 0; j < 9; j++) probs[j] /= z;
    return { probs, feature };
  }

  /**
   * TTA-8 like the server: average softmax and GAP feature over the 4 rotations
   * × optional mirror. `views = 1` is the cheap single pass used while drawing.
   */
  predict(map: ArrayLike<number>, views: 1 | 8 = 8): NetOutput {
    const probs = new Float32Array(9);
    const feature = new Float32Array(128);
    const v = new Uint8Array(4096);
    let n = 0;
    for (let k = 0; k < 4 && n < views; k++) {
      for (const mirror of [false, true]) {
        if (n >= views) break;
        // torch.rot90(x, k) rotates counter-clockwise: out[r][c] = in[c][63-r]
        for (let r = 0; r < 64; r++) {
          for (let c = 0; c < 64; c++) {
            let rr = r, cc = mirror ? 63 - c : c;
            for (let t = 0; t < k; t++) [rr, cc] = [cc, 63 - rr];
            v[r * 64 + c] = map[rr * 64 + cc];
          }
        }
        const out = this.once(v);
        for (let j = 0; j < 9; j++) probs[j] += out.probs[j];
        for (let j = 0; j < 128; j++) feature[j] += out.feature[j];
        n++;
      }
    }
    for (let j = 0; j < 9; j++) probs[j] /= n;
    for (let j = 0; j < 128; j++) feature[j] /= n;
    return { probs, feature };
  }

  /** Project a GAP feature into the PCA-32 space the server searches. */
  project(feature: Float32Array): Float32Array {
    const z = new Float32Array(32);
    for (let i = 0; i < 32; i++) {
      let s = 0;
      for (let j = 0; j < 128; j++) s += this.pcaComp[i * 128 + j] * (feature[j] - this.pcaMean[j]);
      z[i] = s;
    }
    return z;
  }
}
