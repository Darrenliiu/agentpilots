import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentKind } from "@/lib/types";

export const AGENT_MEDIA_BUCKET = "agent-media";

export type CommunityMediaKind = "image" | "video";

export type PersistedMedia = {
  assetId: string;
  publicUrl: string;
  storagePath: string;
  mime: string;
  kind: CommunityMediaKind;
  bytes: number;
};

export type PersistMediaInput = {
  communityId: string;
  agentId: string;
  kind: CommunityMediaKind;
  mime: string;
  bytes: Buffer;
  prompt: string;
  provider: string;
  model: string;
  channelId?: string | null;
  messageId?: string | null;
  createdBy?: string | null;
  assetId?: string;
};

function extForMime(mime: string, kind: CommunityMediaKind) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  return kind === "video" ? "mp4" : "png";
}

export function mediaKindFromMime(
  mime: string,
  fallback: CommunityMediaKind = "image",
): CommunityMediaKind {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return fallback;
}

export function mediaKindFromAgentKind(kind: AgentKind): CommunityMediaKind {
  return kind === "video" ? "video" : "image";
}

export async function persistGeneratedMedia(
  input: PersistMediaInput,
): Promise<PersistedMedia> {
  const admin = createAdminClient();
  const assetId = input.assetId || crypto.randomUUID();
  const ext = extForMime(input.mime, input.kind);
  const storagePath = `${input.communityId}/${input.agentId}/${assetId}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from(AGENT_MEDIA_BUCKET)
    .upload(storagePath, input.bytes, {
      contentType: input.mime,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = admin.storage
    .from(AGENT_MEDIA_BUCKET)
    .getPublicUrl(storagePath);

  const { error: insertError } = await admin.from("community_media_assets").insert({
    id: assetId,
    community_id: input.communityId,
    channel_id: input.channelId ?? null,
    message_id: input.messageId ?? null,
    agent_id: input.agentId,
    created_by: input.createdBy ?? null,
    kind: input.kind,
    mime: input.mime,
    storage_path: storagePath,
    public_url: urlData.publicUrl,
    prompt: input.prompt,
    provider: input.provider,
    model: input.model,
    bytes: input.bytes.byteLength,
  });
  if (insertError) throw insertError;

  return {
    assetId,
    publicUrl: urlData.publicUrl,
    storagePath,
    mime: input.mime,
    kind: input.kind,
    bytes: input.bytes.byteLength,
  };
}

export async function rehostRemoteMedia(opts: {
  url: string;
  communityId: string;
  agentId: string;
  kind: CommunityMediaKind;
  prompt: string;
  provider: string;
  model: string;
  fallbackMime?: string;
  channelId?: string | null;
  createdBy?: string | null;
}): Promise<PersistedMedia> {
  const res = await fetch(opts.url);
  if (!res.ok) {
    throw new Error(`Failed to download generated media (${res.status})`);
  }
  const mime =
    res.headers.get("content-type")?.split(";")[0]?.trim() ||
    opts.fallbackMime ||
    (opts.kind === "video" ? "video/mp4" : "image/png");
  const buffer = Buffer.from(await res.arrayBuffer());
  return persistGeneratedMedia({
    communityId: opts.communityId,
    agentId: opts.agentId,
    kind: mediaKindFromMime(mime, opts.kind),
    mime,
    bytes: buffer,
    prompt: opts.prompt,
    provider: opts.provider,
    model: opts.model,
    channelId: opts.channelId,
    createdBy: opts.createdBy,
  });
}

export async function persistBase64Media(opts: {
  b64: string;
  mime: string;
  communityId: string;
  agentId: string;
  kind: CommunityMediaKind;
  prompt: string;
  provider: string;
  model: string;
  channelId?: string | null;
  createdBy?: string | null;
}): Promise<PersistedMedia> {
  return persistGeneratedMedia({
    communityId: opts.communityId,
    agentId: opts.agentId,
    kind: mediaKindFromMime(opts.mime, opts.kind),
    mime: opts.mime,
    bytes: Buffer.from(opts.b64, "base64"),
    prompt: opts.prompt,
    provider: opts.provider,
    model: opts.model,
    channelId: opts.channelId,
    createdBy: opts.createdBy,
  });
}

export async function linkMediaAssetToMessage(
  assetId: string,
  messageId: string,
  channelId: string,
) {
  const admin = createAdminClient();
  await admin
    .from("community_media_assets")
    .update({ message_id: messageId, channel_id: channelId })
    .eq("id", assetId);
}

export type CommunityMediaAssetRow = {
  id: string;
  community_id: string;
  channel_id: string | null;
  message_id: string | null;
  agent_id: string | null;
  created_by: string | null;
  kind: CommunityMediaKind;
  mime: string;
  storage_path: string;
  public_url: string;
  prompt: string;
  provider: string | null;
  model: string | null;
  bytes: number | null;
  created_at: string;
  agent?: { id: string; name: string; avatar_url: string | null } | null;
  channel?: { id: string; slug: string; name: string; type: string } | null;
};
