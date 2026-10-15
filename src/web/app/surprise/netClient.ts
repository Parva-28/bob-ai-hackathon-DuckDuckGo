/**
 * Main-thread handle on the model worker. Live predictions are latest-wins: while
 * one is running, newer strokes replace the queued one instead of piling up.
 */

export type NetResult = { probs: Float32Array; z: Float32Array | null; scale: number; ms: number };

export class NetClient {
  readonly ready: Promise<void>;
  private worker = new Worker(new URL("./netWorker.ts", import.meta.url));
  private seq = 0;
  private waiting = new Map<number, (r: NetResult) => void>();
  private liveBusy = false;
  private liveNext: { map: Uint8Array; cb: (r: NetResult) => void } | null = null;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.worker.onmessage = (e) => {
        if (e.data.type === "ready") return resolve();
        const cb = this.waiting.get(e.data.seq);
        this.waiting.delete(e.data.seq);
        cb?.(e.data);
      };
    });
  }

  private run(map: Uint8Array, views: 1 | 8): Promise<NetResult> {
    const seq = ++this.seq;
    return new Promise((resolve) => {
      this.waiting.set(seq, resolve);
      this.worker.postMessage({ seq, map: map.slice(), views });
    });
  }

  /** Single pass, for feedback while drawing. */
  live(map: Uint8Array, cb: (r: NetResult) => void) {
    if (this.liveBusy) {
      this.liveNext = { map: map.slice(), cb };
      return;
    }
    this.liveBusy = true;
    this.run(map, 1).then((r) => {
      cb(r);
      this.liveBusy = false;
      const next = this.liveNext;
      this.liveNext = null;
      if (next) this.live(next.map, next.cb);
    });
  }

  /** Full TTA-8 plus the PCA-32 embedding used for the 811k-wafer search. */
  settle(map: Uint8Array) {
    return this.run(map, 8);
  }
}
