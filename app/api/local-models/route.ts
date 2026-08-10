import { NextResponse } from "next/server";
import { readLocalLlmStatus } from "@/lib/local-llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readLocalLlmStatus());
}
