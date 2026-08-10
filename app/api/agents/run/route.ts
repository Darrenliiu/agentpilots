import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAgentsForMessage } from "@/lib/agents/run";

export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { message_id?: string };
  if (!body.message_id) {
    return NextResponse.json({ error: "message_id required" }, { status: 400 });
  }

  const { data: message } = await supabase
    .from("messages")
    .select("id, channel_id, author_id")
    .eq("id", body.message_id)
    .single();

  if (!message || message.author_id !== user.id) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  try {
    const result = await runAgentsForMessage(body.message_id);
    return NextResponse.json(result);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Agent run failed";
    return NextResponse.json({ error }, { status: 500 });
  }
}
