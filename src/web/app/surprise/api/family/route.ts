import type { NextRequest } from "next/server";
import { familyImage } from "@/lib/waferStore";

/** Mean fail map of one discovered pattern family, rendered by screen_all.py. */
export async function GET(req: NextRequest) {
  const png = familyImage(Number(req.nextUrl.searchParams.get("id")));
  if (!png) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
