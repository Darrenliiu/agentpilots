import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function extForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function uploadAvatarFile(
  path: string,
  file: File,
): Promise<{ publicUrl?: string; error?: string }> {
  if (!file || file.size === 0) return {};
  if (file.size > MAX_AVATAR_BYTES) {
    return { error: "Avatar must be 2MB or smaller" };
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return { error: "Avatar must be PNG, JPG, WebP, or GIF" };
  }

  const supabase = await createClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from("avatars").upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (error) return { error: error.message };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Bust CDN/browser cache after replace
  return { publicUrl: `${data.publicUrl}?t=${Date.now()}` };
}

export function userAvatarPath(userId: string, mime: string) {
  return `users/${userId}/avatar.${extForMime(mime)}`;
}

export function agentAvatarPath(
  communityId: string,
  agentId: string,
  mime: string,
) {
  return `agents/${communityId}/${agentId}.${extForMime(mime)}`;
}

export function communityAvatarPath(communityId: string, mime: string) {
  return `communities/${communityId}/avatar.${extForMime(mime)}`;
}
