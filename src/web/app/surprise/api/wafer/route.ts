import type { NextRequest } from "next/server";
import { count, info, maps, siblings } from "@/lib/waferStore";

/** One wafer in full: its map, all 9 class probabilities, human label, and lot siblings. */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id < 0 || id >= count()) {
    return Response.json({ error: "unknown wafer" }, { status: 404 });
  }
  return Response.json({
    ...info(id),
    map: maps([id]).toString("base64"),
    siblings: siblings(id).map((s) => ({ id: s.id, waferIndex: s.waferIndex, probs: s.probs, gt: s.gt })),
  });
}
