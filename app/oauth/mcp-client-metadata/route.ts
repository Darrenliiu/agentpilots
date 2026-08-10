import { NextResponse } from "next/server";
import { buildMcpClientMetadata } from "@/lib/connectors/oauth";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const metadata = buildMcpClientMetadata(origin);
  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
