// Turns an uploaded wafer image or .npy file into a 64×64 WM-811K grid
// (0 off-wafer, 1 pass, 2 fail). No React here, so it can be tested in Node.

type RGB = [number, number, number];
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Pixels of a 64×64 RGBA image → grid, without assuming a palette.
 *
 * The off-wafer background is the median colour of the four corners. When most of
 * the inscribed circle is that colour too, the background doubles as a die colour
 * (white pass dies on a white page), so the wafer is the circle; otherwise it is
 * every pixel that differs from the background. The wafer pixels are split into two
 * colour groups (2-means); the smaller group is the fail dies. A Near-full wafer
 * breaks that guess, which is why the caller offers a swap.
 */
export function imageToGrid(rgba: Uint8ClampedArray | Uint8Array): number[][] {
  const N = 64;
  const px = (i: number): RGB => [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];

  const corners: RGB[] = [];
  for (const [r0, c0] of [[0, 0], [0, N - 4], [N - 4, 0], [N - 4, N - 4]])
    for (let r = r0; r < r0 + 4; r++) for (let c = c0; c < c0 + 4; c++) corners.push(px(r * N + c));
  const med = (k: number) => corners.map((p) => p[k]).sort((a, b) => a - b)[corners.length >> 1];
  const bg: RGB = [med(0), med(1), med(2)];

  // WM-811K maps, resized to 64×64, fill the grid: radius 32 matches the fixtures'
  // wafer outline best (98% of cells, against 93% for the 30.5 the canvas draws).
  const inCircle = (i: number) => Math.hypot((i % N) - 31.5, Math.floor(i / N) - 31.5) <= 32;
  let circle = 0, circleBg = 0;
  for (let i = 0; i < N * N; i++) if (inCircle(i)) { circle++; if (dist(px(i), bg) < 50) circleBg++; }
  const bgIsDieColour = circleBg / circle > 0.5;
  const onWafer = (i: number) => (bgIsDieColour ? inCircle(i) : dist(px(i), bg) >= 50);

  const idx: number[] = [];
  for (let i = 0; i < N * N; i++) if (onWafer(i)) idx.push(i);
  const grid = Array.from({ length: N }, () => Array(N).fill(0));
  if (!idx.length) return grid;

  // 2-means: start from the mean and the pixel farthest from it.
  const mean: RGB = [0, 1, 2].map((k) => idx.reduce((s, i) => s + rgba[i * 4 + k], 0) / idx.length) as RGB;
  let a = mean, b = px(idx.reduce((best, i) => (dist(px(i), mean) > dist(px(best), mean) ? i : best), idx[0]));
  let inB = new Uint8Array(idx.length);
  for (let it = 0; it < 10; it++) {
    inB = Uint8Array.from(idx, (i) => (dist(px(i), b) < dist(px(i), a) ? 1 : 0));
    const avg = (flag: number): RGB => {
      const sel = idx.filter((_, j) => inB[j] === flag);
      return sel.length ? ([0, 1, 2].map((k) => sel.reduce((s, i) => s + rgba[i * 4 + k], 0) / sel.length) as RGB) : (flag ? b : a);
    };
    a = avg(0); b = avg(1);
  }
  const nB = inB.reduce((s, v) => s + v, 0);
  // Two near-identical groups mean one die colour: a wafer with no defects.
  const oneColour = dist(a, b) < 40;
  const failIsB = nB <= idx.length - nB;
  idx.forEach((i, j) => {
    grid[Math.floor(i / N)][i % N] = oneColour ? 1 : (inB[j] === 1) === failIsB ? 2 : 1;
  });
  return grid;
}

/** Pass ⇄ fail, for a wafer whose defects are the majority (Near-full). */
export const swapPassFail = (g: number[][]) => g.map((row) => row.map((v) => (v === 1 ? 2 : v === 2 ? 1 : 0)));

/** A NumPy .npy file (v1–v3, little-endian integer or float, 2-D) → 64×64 grid of 0/1/2. */
export function parseNpy(buf: ArrayBuffer): number[][] {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x93 || String.fromCharCode(...u8.slice(1, 6)) !== "NUMPY") throw new Error("not a .npy file");
  const major = u8[6];
  const dv = new DataView(buf);
  const hlen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const start = major === 1 ? 10 : 12;
  const header = new TextDecoder().decode(u8.slice(start, start + hlen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const shape = /'shape':\s*\((\d+),\s*(\d+)\)/.exec(header);
  if (!descr || !shape) throw new Error("expected a 2-D array");
  if (/True/.test(/'fortran_order':\s*(\w+)/.exec(header)?.[1] ?? "")) throw new Error("Fortran-order arrays are not supported");
  const [rows, cols] = [Number(shape[1]), Number(shape[2])];
  const off = start + hlen;
  const readers: Record<string, [number, (o: number) => number]> = {
    "|u1": [1, (o) => dv.getUint8(o)], "|i1": [1, (o) => dv.getInt8(o)],
    "<u2": [2, (o) => dv.getUint16(o, true)], "<i2": [2, (o) => dv.getInt16(o, true)],
    "<i4": [4, (o) => dv.getInt32(o, true)], "<i8": [8, (o) => Number(dv.getBigInt64(o, true))],
    "<f4": [4, (o) => dv.getFloat32(o, true)], "<f8": [8, (o) => dv.getFloat64(o, true)],
  };
  const reader = readers[descr];
  if (!reader) throw new Error(`unsupported dtype ${descr}`);
  const [size, read] = reader;
  const grid = Array.from({ length: 64 }, (_, r) => Array.from({ length: 64 }, (_, c) => {
    // nearest-neighbour resize, as the classifier itself does
    const rr = Math.min(rows - 1, Math.floor((r * rows) / 64)), cc = Math.min(cols - 1, Math.floor((c * cols) / 64));
    return Math.round(read(off + (rr * cols + cc) * size));
  }));
  if (grid.some((row) => row.some((v) => v !== 0 && v !== 1 && v !== 2)))
    throw new Error("values must be 0 (off-wafer), 1 (pass) or 2 (fail)");
  return grid;
}
