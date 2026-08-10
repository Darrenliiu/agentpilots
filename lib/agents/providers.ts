import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI, google } from "@ai-sdk/google";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { createXai, xai } from "@ai-sdk/xai";
import {
  stepCountIs,
  streamText,
  type FilePart,
  type ImagePart,
  type TextPart,
  type ToolSet,
  type UserContent,
} from "ai";
import {
  fetchTextAttachmentContent,
  isImageMime,
  isPdfMime,
  isTextMime,
} from "@/lib/message-attachments";
import type { Agent, AgentRunPhase, MessageAttachment } from "@/lib/types";
import {
  mediaKindFromAgentKind,
  persistBase64Media,
  persistGeneratedMedia,
  rehostRemoteMedia,
  type CommunityMediaKind,
  type PersistedMedia,
} from "@/lib/community-media";

const NATIVE_WEB_SEARCH_KEYS = new Set(["web_search", "google_search"]);

/** Provider-executed web search tools (no Exa / MCP required). */
export function getProviderWebSearchTools(provider: string): ToolSet {
  switch (provider) {
    case "openai":
      return { web_search: openai.tools.webSearch({}) };
    case "anthropic":
      return { web_search: anthropic.tools.webSearch_20250305() };
    case "google":
      return { google_search: google.tools.googleSearch({}) };
    case "xai":
      return { web_search: xai.tools.webSearch({}) };
    default:
      return {};
  }
}

function stripNativeWebSearchTools(tools: ToolSet | undefined): ToolSet {
  if (!tools) return {};
  const next: ToolSet = {};
  for (const [key, value] of Object.entries(tools)) {
    if (!NATIVE_WEB_SEARCH_KEYS.has(key)) next[key] = value;
  }
  return next;
}

function looksLikeWebSearchError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /web[_\s-]?search|google[_\s-]?search|grounding|search tool/i.test(msg);
}

export async function buildUserContentFromAttachments(
  prompt: string,
  attachments: MessageAttachment[] | undefined,
): Promise<{ content: UserContent; warnings: string[] }> {
  const warnings: string[] = [];
  const text = prompt.trim();
  if (!attachments?.length) {
    return { content: text || "(empty message)", warnings };
  }

  const parts: Array<TextPart | ImagePart | FilePart> = [];
  if (text) parts.push({ type: "text", text });

  for (const att of attachments) {
    try {
      if (isImageMime(att.mime)) {
        parts.push({
          type: "image",
          image: new URL(att.url),
          mediaType: att.mime,
        });
        continue;
      }
      if (isTextMime(att.mime)) {
        const body = await fetchTextAttachmentContent(att);
        parts.push({
          type: "text",
          text: `Attached file: ${att.name}\n\n${body}`,
        });
        continue;
      }
      if (isPdfMime(att.mime)) {
        parts.push({
          type: "file",
          data: new URL(att.url),
          mediaType: "application/pdf",
          filename: att.name,
        });
        continue;
      }
      warnings.push(`Skipped unsupported attachment ${att.name}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "read failed";
      warnings.push(`${att.name}: ${msg}`);
    }
  }

  if (!parts.length) {
    return {
      content: text || "(attachments could not be read)",
      warnings,
    };
  }
  return { content: parts, warnings };
}

export type AgentTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type AgentProgressUpdate = {
  phase: AgentRunPhase;
  statusText: string;
};

const STATUS_TEXT_MAX = 100;
const REASONING_THROTTLE_MS = 400;

function friendlyToolLabel(toolName: string) {
  const bare = toolName.includes("__")
    ? toolName.split("__").slice(1).join("__")
    : toolName.includes(":")
      ? toolName.split(":").slice(1).join(":")
      : toolName;
  const spaced = bare.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "Using tool";
  return `Using ${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
}

function truncateStatus(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= STATUS_TEXT_MAX) return cleaned;
  return `…${cleaned.slice(-(STATUS_TEXT_MAX - 1))}`;
}

export async function generateAgentTextReply(opts: {
  agent: Agent;
  apiKey: string;
  baseUrl?: string | null;
  systemPrompt: string;
  userPrompt: string;
  attachments?: MessageAttachment[];
  history: { role: "user" | "assistant"; content: string }[];
  tools?: ToolSet;
  maxSteps?: number;
  onProgress?: (update: AgentProgressUpdate) => void | Promise<void>;
}): Promise<{ text: string; warnings: string[]; usage: AgentTokenUsage | null }> {
  const model = getLanguageModel(opts.agent, opts.apiKey, opts.baseUrl);
  const warnings: string[] = [];
  const { content: userContent, warnings: attachWarnings } =
    await buildUserContentFromAttachments(opts.userPrompt, opts.attachments);
  warnings.push(...attachWarnings);

  let tools = opts.tools;
  const hasTools = tools && Object.keys(tools).length > 0;

  if (hasTools && opts.agent.provider === "local") {
    warnings.push(
      "Connectors require a tool-capable cloud model; local agent ran without MCP tools.",
    );
  }

  let useTools = Boolean(hasTools && opts.agent.provider !== "local");
  const onProgress = opts.onProgress;

  await onProgress?.({ phase: "thinking", statusText: "Thinking…" });

  const messages = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userContent },
  ];

  async function runOnce(activeTools: ToolSet | undefined) {
    const result = streamText({
      model,
      system:
        opts.systemPrompt ||
        `You are ${opts.agent.name}, a helpful community agent.`,
      messages,
      ...(activeTools && Object.keys(activeTools).length
        ? {
            tools: activeTools,
            stopWhen: stepCountIs(opts.maxSteps ?? 8),
          }
        : {}),
    });

    let reasoningBuf = "";
    let lastReasoningWrite = 0;
    let sawText = false;

    for await (const part of result.fullStream) {
      if (part.type === "reasoning-delta") {
        const chunk =
          "text" in part && typeof part.text === "string"
            ? part.text
            : "delta" in part &&
                typeof (part as { delta?: string }).delta === "string"
              ? (part as { delta: string }).delta
              : "";
        if (!chunk) continue;
        reasoningBuf += chunk;
        const now = Date.now();
        if (now - lastReasoningWrite >= REASONING_THROTTLE_MS) {
          lastReasoningWrite = now;
          await onProgress?.({
            phase: "reasoning",
            statusText: truncateStatus(reasoningBuf),
          });
        }
        continue;
      }

      if (part.type === "tool-call" || part.type === "tool-input-start") {
        const name =
          "toolName" in part && typeof part.toolName === "string"
            ? part.toolName
            : "tool";
        await onProgress?.({
          phase: "tool",
          statusText: friendlyToolLabel(name),
        });
        continue;
      }

      if (part.type === "text-delta" && !sawText) {
        sawText = true;
        await onProgress?.({
          phase: "generating",
          statusText: "Generating reply",
        });
      }
    }

    if (reasoningBuf && Date.now() - lastReasoningWrite >= 50) {
      await onProgress?.({
        phase: "reasoning",
        statusText: truncateStatus(reasoningBuf),
      });
    }

    const [text, usage] = await Promise.all([result.text, result.usage]);
    return { text, usage };
  }

  let text: string;
  let usage: Awaited<ReturnType<typeof runOnce>>["usage"];

  try {
    const once = await runOnce(useTools ? tools : undefined);
    text = once.text;
    usage = once.usage;
  } catch (err) {
    const hadNativeSearch =
      useTools &&
      tools &&
      Object.keys(tools).some((k) => NATIVE_WEB_SEARCH_KEYS.has(k));
    if (hadNativeSearch) {
      warnings.push(
        looksLikeWebSearchError(err)
          ? "Native web search was unavailable for this model; replied without it."
          : "Agent call failed with web search enabled; retried without native web search.",
      );
      tools = stripNativeWebSearchTools(tools);
      useTools = Object.keys(tools).length > 0;
      const once = await runOnce(useTools ? tools : undefined);
      text = once.text;
      usage = once.usage;
    } else {
      throw err;
    }
  }

  const inputTokens = usage.inputTokens ?? null;
  const outputTokens = usage.outputTokens ?? null;
  const totalTokens =
    usage.totalTokens ??
    (inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : null);

  const tokenUsage: AgentTokenUsage | null =
    inputTokens != null || outputTokens != null || totalTokens != null
      ? { inputTokens, outputTokens, totalTokens }
      : null;

  return { text: text.trim() || "(no response)", warnings, usage: tokenUsage };
}

function getLanguageModel(
  agent: Agent,
  apiKey: string,
  baseUrl?: string | null,
) {
  switch (agent.provider) {
    case "local":
      // Chat Completions — llama.cpp / local servers don't speak Responses API
      return createOpenAI({
        apiKey: apiKey || "local",
        baseURL:
          baseUrl ||
          process.env.LOCAL_LLM_BASE_URL ||
          "http://127.0.0.1:11435/v1",
      }).chat(agent.model || "qwen2.5-1.5b-instruct");
    case "anthropic":
      return createAnthropic({ apiKey })(agent.model || "claude-sonnet-4-5");
    case "google":
      return createGoogleGenerativeAI({ apiKey })(agent.model || "gemini-2.0-flash");
    case "xai":
      return createXai({ apiKey })(agent.model || "grok-3");
    case "openrouter":
      return createOpenAI({
        apiKey,
        baseURL: "https://openrouter.ai/api/v1",
      }).chat(agent.model || "moonshotai/kimi-k2");
    case "openai-compatible":
      return createOpenAI({
        apiKey,
        baseURL: baseUrl || "https://api.openai.com/v1",
      }).chat(agent.model || "gpt-4o-mini");
    case "openai":
    default:
      return createOpenAI({ apiKey })(agent.model || "gpt-4o-mini");
  }
}

export type GenerateMediaOpts = {
  agent: Agent;
  apiKey: string;
  prompt: string;
  communityId: string;
  channelId?: string | null;
  createdBy?: string | null;
  onProgress?: (update: AgentProgressUpdate) => void | Promise<void>;
};

function mediaMetadata(
  agent: Agent,
  persisted: PersistedMedia,
  prompt: string,
  extra: Record<string, unknown> = {},
) {
  return {
    kind: agent.kind,
    media_url: persisted.publicUrl,
    media_mime: persisted.mime,
    media_kind: persisted.kind,
    asset_id: persisted.assetId,
    provider: agent.provider,
    model: agent.model,
    prompt,
    ...extra,
  };
}

function higgsfieldAuthHeader(apiKey: string) {
  // Platform model queue expects "Key id:secret"; image OpenAI-compat path accepts Bearer.
  if (apiKey.includes(":")) return `Key ${apiKey}`;
  return `Bearer ${apiKey}`;
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function pollHiggsfieldRequest(opts: {
  apiKey: string;
  requestId: string;
  onProgress?: GenerateMediaOpts["onProgress"];
  label: string;
}): Promise<{ images?: { url?: string }[]; video?: { url?: string }; url?: string }> {
  const auth = higgsfieldAuthHeader(opts.apiKey);
  const maxAttempts = 90;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `https://platform.higgsfield.ai/requests/${opts.requestId}/status`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    );
    if (!res.ok) {
      throw new Error(`Higgsfield status error: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      status?: string;
      images?: { url?: string }[];
      video?: { url?: string };
      url?: string;
    };
    const status = (data.status || "").toLowerCase();
    if (status === "completed") return data;
    if (status === "failed" || status === "nsfw") {
      throw new Error(`Higgsfield generation ${status}`);
    }
    await opts.onProgress?.({
      phase: "generating",
      statusText: `${opts.label} (${status || "queued"}…)`,
    });
    await sleep(2000);
  }
  throw new Error("Higgsfield generation timed out");
}

async function generateHiggsfieldImage(opts: GenerateMediaOpts): Promise<{
  body: string;
  metadata: Record<string, unknown>;
}> {
  const model = opts.agent.model || "gpt-image-2";
  const res = await fetch("https://platform.higgsfield.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      model,
    }),
  });
  if (!res.ok) {
    throw new Error(`Higgsfield error: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data?: { url?: string; b64_json?: string }[];
    url?: string;
  };
  const url = data.data?.[0]?.url || data.url;
  let persisted: PersistedMedia;
  if (url) {
    persisted = await rehostRemoteMedia({
      url,
      communityId: opts.communityId,
      agentId: opts.agent.id,
      kind: "image",
      prompt: opts.prompt,
      provider: "higgsfield",
      model,
      channelId: opts.channelId,
      createdBy: opts.createdBy,
    });
  } else if (data.data?.[0]?.b64_json) {
    persisted = await persistBase64Media({
      b64: data.data[0].b64_json,
      mime: "image/png",
      communityId: opts.communityId,
      agentId: opts.agent.id,
      kind: "image",
      prompt: opts.prompt,
      provider: "higgsfield",
      model,
      channelId: opts.channelId,
      createdBy: opts.createdBy,
    });
  } else {
    throw new Error("Higgsfield returned no media");
  }
  return {
    body: opts.prompt,
    metadata: mediaMetadata(opts.agent, persisted, opts.prompt),
  };
}

async function generateHiggsfieldVideo(opts: GenerateMediaOpts): Promise<{
  body: string;
  metadata: Record<string, unknown>;
}> {
  const model = opts.agent.model || "higgsfield-ai/dop/standard";
  await opts.onProgress?.({
    phase: "generating",
    statusText: "Generating starter frame",
  });

  // Text-to-video via image frame + image-to-video (Higgsfield video models expect image_url).
  const frame = await generateHiggsfieldImage({
    ...opts,
    agent: {
      ...opts.agent,
      kind: "image",
      model: "gpt-image-2",
    },
  });
  const imageUrl = String(frame.metadata.media_url || "");
  if (!imageUrl) throw new Error("Could not create frame for video");

  await opts.onProgress?.({
    phase: "generating",
    statusText: "Generating video",
  });

  const auth = higgsfieldAuthHeader(opts.apiKey);
  const submit = await fetch(`https://platform.higgsfield.ai/${model}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_url: imageUrl,
      duration: 5,
    }),
  });
  if (!submit.ok) {
    throw new Error(`Higgsfield video error: ${await submit.text()}`);
  }
  const queued = (await submit.json()) as { request_id?: string; status?: string };
  if (!queued.request_id) {
    throw new Error("Higgsfield video did not return a request_id");
  }
  const done = await pollHiggsfieldRequest({
    apiKey: opts.apiKey,
    requestId: queued.request_id,
    onProgress: opts.onProgress,
    label: "Generating video",
  });
  const videoUrl = done.video?.url || done.url || done.images?.[0]?.url;
  if (!videoUrl) throw new Error("Higgsfield returned no video URL");

  const persisted = await rehostRemoteMedia({
    url: videoUrl,
    communityId: opts.communityId,
    agentId: opts.agent.id,
    kind: "video",
    prompt: opts.prompt,
    provider: "higgsfield",
    model,
    fallbackMime: "video/mp4",
    channelId: opts.channelId,
    createdBy: opts.createdBy,
  });

  return {
    body: opts.prompt,
    metadata: mediaMetadata(opts.agent, persisted, opts.prompt, {
      frame_asset_id: frame.metadata.asset_id,
    }),
  };
}

async function generateGoogleImage(opts: GenerateMediaOpts): Promise<{
  body: string;
  metadata: Record<string, unknown>;
}> {
  const model = opts.agent.model || "gemini-2.0-flash-preview-image-generation";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini media error: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: {
          text?: string;
          inlineData?: { data: string; mimeType: string };
        }[];
      };
    }[];
  };
  const parts = data.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p) => p.inlineData)?.inlineData;
  const text = parts.find((p) => p.text)?.text;
  if (!inline?.data) {
    return {
      body: text || "No image returned.",
      metadata: { kind: opts.agent.kind, provider: "google" },
    };
  }
  const mime = inline.mimeType || "image/png";
  const persisted = await persistBase64Media({
    b64: inline.data,
    mime,
    communityId: opts.communityId,
    agentId: opts.agent.id,
    kind: "image",
    prompt: opts.prompt,
    provider: "google",
    model,
    channelId: opts.channelId,
    createdBy: opts.createdBy,
  });
  return {
    body: text || opts.prompt,
    metadata: mediaMetadata(opts.agent, persisted, opts.prompt),
  };
}

async function generateOpenAIImage(opts: GenerateMediaOpts): Promise<{
  body: string;
  metadata: Record<string, unknown>;
}> {
  const model = opts.agent.model || "dall-e-3";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI image error: ${await res.text()}`);
  }
  const result = (await res.json()) as {
    data?: { url?: string; b64_json?: string }[];
  };
  const url = result.data?.[0]?.url;
  let persisted: PersistedMedia;
  if (url) {
    persisted = await rehostRemoteMedia({
      url,
      communityId: opts.communityId,
      agentId: opts.agent.id,
      kind: "image",
      prompt: opts.prompt,
      provider: "openai",
      model,
      channelId: opts.channelId,
      createdBy: opts.createdBy,
    });
  } else if (result.data?.[0]?.b64_json) {
    persisted = await persistBase64Media({
      b64: result.data[0].b64_json,
      mime: "image/png",
      communityId: opts.communityId,
      agentId: opts.agent.id,
      kind: "image",
      prompt: opts.prompt,
      provider: "openai",
      model,
      channelId: opts.channelId,
      createdBy: opts.createdBy,
    });
  } else {
    throw new Error("OpenAI image generation returned no media");
  }
  return {
    body: opts.prompt,
    metadata: mediaMetadata(opts.agent, persisted, opts.prompt),
  };
}

async function generateOpenAIVideo(opts: GenerateMediaOpts): Promise<{
  body: string;
  metadata: Record<string, unknown>;
}> {
  const model = opts.agent.model || "sora-2";
  await opts.onProgress?.({
    phase: "generating",
    statusText: "Starting video job",
  });

  const create = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
    }),
  });
  if (!create.ok) {
    throw new Error(`OpenAI video error: ${await create.text()}`);
  }
  const job = (await create.json()) as {
    id?: string;
    status?: string;
    error?: { message?: string };
  };
  if (!job.id) throw new Error("OpenAI video job missing id");

  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts; i++) {
    const statusRes = await fetch(`https://api.openai.com/v1/videos/${job.id}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });
    if (!statusRes.ok) {
      throw new Error(`OpenAI video status error: ${await statusRes.text()}`);
    }
    const status = (await statusRes.json()) as {
      id: string;
      status?: string;
      error?: { message?: string };
      video_url?: string;
      url?: string;
    };
    const state = (status.status || "").toLowerCase();
    if (state === "failed" || state === "cancelled") {
      throw new Error(
        status.error?.message || `OpenAI video ${state || "failed"}`,
      );
    }
    if (state === "completed") {
      const contentRes = await fetch(
        `https://api.openai.com/v1/videos/${job.id}/content`,
        { headers: { Authorization: `Bearer ${opts.apiKey}` } },
      );
      if (contentRes.ok) {
        const mime =
          contentRes.headers.get("content-type")?.split(";")[0]?.trim() ||
          "video/mp4";
        const buffer = Buffer.from(await contentRes.arrayBuffer());
        const persisted = await persistGeneratedMedia({
          communityId: opts.communityId,
          agentId: opts.agent.id,
          kind: "video",
          mime,
          bytes: buffer,
          prompt: opts.prompt,
          provider: "openai",
          model,
          channelId: opts.channelId,
          createdBy: opts.createdBy,
        });
        return {
          body: opts.prompt,
          metadata: mediaMetadata(opts.agent, persisted, opts.prompt),
        };
      }
      const remoteUrl = status.video_url || status.url;
      if (remoteUrl) {
        const persisted = await rehostRemoteMedia({
          url: remoteUrl,
          communityId: opts.communityId,
          agentId: opts.agent.id,
          kind: "video",
          prompt: opts.prompt,
          provider: "openai",
          model,
          fallbackMime: "video/mp4",
          channelId: opts.channelId,
          createdBy: opts.createdBy,
        });
        return {
          body: opts.prompt,
          metadata: mediaMetadata(opts.agent, persisted, opts.prompt),
        };
      }
      throw new Error("OpenAI video completed but no content was returned");
    }
    await opts.onProgress?.({
      phase: "generating",
      statusText: `Generating video (${state || "queued"}…)`,
    });
    await sleep(3000);
  }
  throw new Error("OpenAI video generation timed out");
}

export async function generateAgentMediaReply(
  opts: GenerateMediaOpts,
): Promise<{ body: string; metadata: Record<string, unknown> }> {
  const mediaKind = mediaKindFromAgentKind(opts.agent.kind);

  if (opts.agent.provider === "midjourney") {
    return {
      body: "Midjourney is not available yet. Switch this agent to OpenAI, Gemini, or Higgsfield.",
      metadata: { kind: opts.agent.kind, pending: true },
    };
  }

  if (mediaKind === "video") {
    if (opts.agent.provider === "google") {
      throw new Error(
        "Gemini does not support video agents yet. Use OpenAI (Sora) or Higgsfield.",
      );
    }
    if (opts.agent.provider === "higgsfield") {
      return generateHiggsfieldVideo(opts);
    }
    if (opts.agent.provider === "openai") {
      return generateOpenAIVideo(opts);
    }
    throw new Error(
      `Provider "${opts.agent.provider}" does not support video generation.`,
    );
  }

  if (opts.agent.provider === "higgsfield") {
    return generateHiggsfieldImage(opts);
  }
  if (opts.agent.provider === "google") {
    return generateGoogleImage(opts);
  }
  if (opts.agent.provider === "openai") {
    return generateOpenAIImage(opts);
  }
  throw new Error(
    `Provider "${opts.agent.provider}" does not support image generation.`,
  );
}

// Keep type import used for callers that only need the kind helper.
export type { CommunityMediaKind };

export function extractMentionedAgentIds(
  body: string,
  agents: { id: string; name: string; slug: string }[],
): string[] {
  const ids = new Set<string>();
  for (const agent of agents) {
    const patterns = [
      new RegExp(`@${escapeRegExp(agent.name)}\\b`, "i"),
      new RegExp(`@${escapeRegExp(agent.slug)}\\b`, "i"),
    ];
    if (patterns.some((re) => re.test(body))) ids.add(agent.id);
  }
  return [...ids];
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripAgentMentions(body: string, agent: { name: string; slug: string }) {
  return body
    .replace(new RegExp(`@${escapeRegExp(agent.name)}\\b`, "gi"), "")
    .replace(new RegExp(`@${escapeRegExp(agent.slug)}\\b`, "gi"), "")
    .trim();
}
