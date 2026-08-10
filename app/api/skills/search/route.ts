import { NextResponse } from "next/server";
import { searchSkillRegistry } from "@/lib/skills/registry";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const limit = Math.min(Number(searchParams.get("limit") || 20), 50);

  const results = await searchSkillRegistry(q, limit);
  return NextResponse.json({ results });
}
