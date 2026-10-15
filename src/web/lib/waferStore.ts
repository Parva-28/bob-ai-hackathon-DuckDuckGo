import fs from "node:fs";
import path from "node:path";

/**
 * Read-only access to the WM-811K screening outputs written by
 * src/models/vision/screen_all.py. Every wafer is a fixed-size record, so a
 * lookup is one positional read — the 830 MB of maps never load into memory.
 */

const DIR = path.join(process.cwd(), "..", "models", "vision", "data", "screen");

export const MAP_BYTES = 1024;          // 64×64 at 2 bits/pixel
const INFO_INTS = 6;                    // lot, waferIndex, rows, cols, gt, split
const PCA_DIMS = 32;

let fds: Record<string, number> | null = null;
let lots: string[] | null = null;
let pca: Int8Array | null = null;
let xy: Uint16Array | null = null;
let total = 0;

function open() {
  if (fds) return fds;
  const f = (name: string) => fs.openSync(path.join(DIR, name), "r");
  fds = { maps: f("maps64.bin"), probs: f("probs_u8.bin"), info: f("info.bin") };
  total = fs.fstatSync(fds.maps).size / MAP_BYTES;
  return fds;
}

export function count() {
  open();
  return total;
}

function read(fd: number, size: number, offset: number) {
  const buf = Buffer.alloc(size);
  fs.readSync(fd, buf, 0, size, offset);
  return buf;
}

/** Packed maps for many wafers, concatenated in request order. */
export function maps(ids: ArrayLike<number>): Buffer {
  const { maps: fd } = open();
  const out = Buffer.alloc(ids.length * MAP_BYTES);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (id >= 0 && id < total) fs.readSync(fd, out, i * MAP_BYTES, MAP_BYTES, id * MAP_BYTES);
  }
  return out;
}

export type WaferInfo = {
  id: number;
  lot: string;
  waferIndex: number;
  rows: number;
  cols: number;
  gt: number;          // -1 when no human ever labeled it
  split: number;       // -1 unlabeled, 0 labeled but never trained on, 1 train, 2 holdout
  probs: number[];
};

function lotNames() {
  lots ??= JSON.parse(fs.readFileSync(path.join(DIR, "lots.json"), "utf8")) as string[];
  return lots;
}

export function info(id: number): WaferInfo {
  const f = open();
  const row = new Int32Array(read(f.info, INFO_INTS * 4, id * INFO_INTS * 4).buffer.slice(0));
  const p = read(f.probs, 9, id * 9);
  return {
    id,
    lot: lotNames()[row[0]] ?? "?",
    waferIndex: row[1],
    rows: row[2],
    cols: row[3],
    gt: row[4],
    split: row[5],
    probs: Array.from(p, (v) => v / 255),
  };
}

/**
 * Wafers from the same lot. WM-811K stores a lot's wafers contiguously, so a
 * short scan either side of `id` finds them all (a lot holds at most 25).
 */
export function siblings(id: number): WaferInfo[] {
  const lot = info(id).lot;
  const out: WaferInfo[] = [];
  for (let j = Math.max(0, id - 30); j < Math.min(count(), id + 31); j++) {
    const w = info(j);
    if (w.lot === lot) out.push(w);
  }
  return out.sort((a, b) => a.waferIndex - b.waferIndex);
}

export function familyImage(id: number): Buffer | null {
  const p = path.join(DIR, `family_${id}.png`);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/**
 * Brute-force nearest neighbours in the model's PCA-32 embedding space over all
 * 811,457 wafers. int8 storage keeps it at 26 MB; a full scan is ~30 ms.
 */
export function nearest(query: Float32Array, scale: number, k: number) {
  pca ??= new Int8Array(fs.readFileSync(path.join(DIR, "pca32_i8.bin")).buffer.slice(0));
  xy ??= new Uint16Array(fs.readFileSync(path.join(DIR, "xy_u16.bin")).buffer.slice(0));
  const q = query.map((v) => v / scale);
  const n = pca.length / PCA_DIMS;
  const bestD = new Float32Array(k).fill(Infinity);
  const bestI = new Int32Array(k).fill(-1);
  for (let i = 0; i < n; i++) {
    let d = 0;
    const o = i * PCA_DIMS;
    for (let j = 0; j < PCA_DIMS; j++) {
      const t = q[j] - pca[o + j];
      d += t * t;
      if (d >= bestD[k - 1]) break;
    }
    if (d >= bestD[k - 1]) continue;
    let p = k - 1;
    while (p > 0 && bestD[p - 1] > d) {
      bestD[p] = bestD[p - 1];
      bestI[p] = bestI[p - 1];
      p--;
    }
    bestD[p] = d;
    bestI[p] = i;
  }
  return Array.from(bestI, (id, r) => ({
    id,
    d: Math.sqrt(bestD[r]) * scale,
    x: xy![id * 2],
    y: xy![id * 2 + 1],
  }));
}
