import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageAttachment } from "@/lib/types";

export const MESSAGE_ATTACHMENT_BUCKET = "message-attachments";
export const MAX_MESSAGE_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/json",
]);

const PDF_TYPE = "application/pdf";

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  pdf: "application/pdf",
};

export function isImageMime(mime: string) {
  return IMAGE_TYPES.has(mime);
}

export function isTextMime(mime: string) {
  return TEXT_TYPES.has(mime);
}

export function isPdfMime(mime: string) {
  return mime === PDF_TYPE;
}

export function isAllowedAttachmentMime(mime: string) {
  return isImageMime(mime) || isTextMime(mime) || isPdfMime(mime);
}

export function resolveAttachmentMime(file: File): string {
  if (file.type && isAllowedAttachmentMime(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  return EXT_MIME[ext] || file.type || "application/octet-stream";
}

function extForMime(mime: string, fallbackName: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/markdown") return "md";
  if (mime === "text/csv") return "csv";
  if (mime === "application/json" || mime === "text/json") return "json";
  if (mime === "text/plain") return "txt";
  const fromName = fallbackName.split(".").pop();
  return fromName && fromName.length <= 8 ? fromName : "bin";
}

export function validateAttachmentFile(
  file: File,
): { ok: true; mime: string } | { ok: false; error: string } {
  if (!file || file.size === 0) return { ok: false, error: "Empty file" };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `${file.name} must be 10MB or smaller` };
  }
  const mime = resolveAttachmentMime(file);
  if (!isAllowedAttachmentMime(mime)) {
    return {
      ok: false,
      error: `${file.name}: use PNG, JPG, WebP, GIF, TXT, MD, CSV, JSON, or PDF`,
    };
  }
  return { ok: true, mime };
}

export async function uploadMessageAttachments(opts: {
  supabase: SupabaseClient;
  communityId: string;
  channelId: string;
  files: File[];
}): Promise<{ attachments: MessageAttachment[]; error?: string }> {
  if (opts.files.length > MAX_MESSAGE_ATTACHMENTS) {
    return {
      attachments: [],
      error: `You can attach up to ${MAX_MESSAGE_ATTACHMENTS} files`,
    };
  }

  const batchId = crypto.randomUUID();
  const attachments: MessageAttachment[] = [];

  for (const file of opts.files) {
    const validated = validateAttachmentFile(file);
    if (!validated.ok) return { attachments: [], error: validated.error };

    const ext = extForMime(validated.mime, file.name);
    const path = `${opts.communityId}/${opts.channelId}/${batchId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await opts.supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .upload(path, file, {
        contentType: validated.mime,
        upsert: false,
      });
    if (error) return { attachments: [], error: error.message };

    const { data } = opts.supabase.storage
      .from(MESSAGE_ATTACHMENT_BUCKET)
      .getPublicUrl(path);

    attachments.push({
      url: data.publicUrl,
      name: file.name,
      mime: validated.mime,
      size: file.size,
    });
  }

  return { attachments };
}

const TEXT_INLINE_MAX = 40_000;

export async function fetchTextAttachmentContent(
  attachment: MessageAttachment,
): Promise<string> {
  const res = await fetch(attachment.url);
  if (!res.ok) throw new Error(`Could not read ${attachment.name}`);
  const text = await res.text();
  if (text.length <= TEXT_INLINE_MAX) return text;
  return `${text.slice(0, TEXT_INLINE_MAX)}\n\n…[truncated]`;
}
