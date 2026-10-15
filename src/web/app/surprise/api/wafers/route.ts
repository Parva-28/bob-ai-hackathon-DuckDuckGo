import { maps } from "@/lib/waferStore";

/** POST a Uint32Array of wafer ids; returns their packed 64×64 maps, 1024 bytes each. */
export async function POST(req: Request) {
  const ids = new Uint32Array(await req.arrayBuffer()).subarray(0, 4000);
  return new Response(new Uint8Array(maps(ids)), {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
