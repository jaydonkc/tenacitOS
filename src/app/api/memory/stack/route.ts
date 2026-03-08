import { NextResponse } from "next/server";
import { getMemoryStackSnapshot, type MemoryStackSnapshot } from "@/lib/memory-stack";

export const dynamic = "force-dynamic";

let cache: { data: MemoryStackSnapshot; ts: number } | null = null;
const CACHE_MS = 30_000;

export async function GET() {
  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return NextResponse.json(cache.data);
  }

  try {
    const data = getMemoryStackSnapshot();
    cache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (error) {
    console.error("[memory/stack] Error:", error);
    return NextResponse.json({ error: "Failed to load memory stack" }, { status: 500 });
  }
}
