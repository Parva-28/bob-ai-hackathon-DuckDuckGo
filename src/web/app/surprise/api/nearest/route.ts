import { nearest } from "@/lib/waferStore";

/** POST { z: number[32], scale: number } — a sketch's embedding; returns its 24 nearest real wafers. */
export async function POST(req: Request) {
  const { z, scale } = (await req.json()) as { z: number[]; scale: number };
  if (!Array.isArray(z) || z.length !== 32 || !(scale > 0)) {
    return Response.json({ error: "expected z[32] and scale" }, { status: 400 });
  }
  const t = performance.now();
  const hits = nearest(Float32Array.from(z), scale, 24);
  return Response.json({ hits, ms: Math.round(performance.now() - t) });
}
