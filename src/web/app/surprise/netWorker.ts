/** Runs WaferNet off the main thread so drawing never stutters. */
import { WaferNet } from "./waferNet";

type Req = { seq: number; map: Uint8Array; views: 1 | 8 };

const ctx = self as unknown as {
  postMessage(m: unknown): void;
  onmessage: ((e: MessageEvent<Req>) => void) | null;
};

const ready = WaferNet.load().then((net) => {
  ctx.postMessage({ type: "ready" });
  return net;
});

ctx.onmessage = async (e) => {
  const net = await ready;
  const { seq, map, views } = e.data;
  const t = performance.now();
  const out = net.predict(map, views);
  ctx.postMessage({
    type: "result",
    seq,
    probs: out.probs,
    z: views === 8 ? net.project(out.feature) : null,
    scale: net.pcaScale,
    ms: performance.now() - t,
  });
};
