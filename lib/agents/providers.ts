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
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function generateAgentMediaReply(opts: {
  agent: Agent;
  apiKey: string;
  prompt: string;
}): Promise<{ body: string; metadata: Record<string, unknown> }> {
  if (opts.agent.provider === "midjourney") {
    return {
      body: "Midjourney is not available yet. Switch this agent to OpenAI, Gemini, or Higgsfield.",
      metadata: { kind: opts.agent.kind, pending: true },
    };
  }

  if (opts.agent.provider === "higgsfield") {
    const res = await fetch("https://platform.higgsfield.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        model: opts.agent.model || "gpt-image-2",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Higgsfield error: ${err}`);
    }
    const data = (await res.json()) as {
      data?: { url?: string; b64_json?: string }[];
      url?: string;
    };
    const url = data.data?.[0]?.url || data.url;
    if (url) {
      return {
        body: opts.prompt,
        metadata: { kind: opts.agent.kind, media_url: url, provider: "higgsfield" },
      };
    }
    const b64 = data.data?.[0]?.b64_json;
    if (b64) {
      const mediaUrl = await uploadBase64Media(b64, "image/png", opts.agent.id);
      return {
        body: opts.prompt,
        metadata: { kind: opts.agent.kind, media_url: mediaUrl, provider: "higgsfield" },
      };
    }
    throw new Error("Higgsfield returned no media");
  }

  if (opts.agent.provider === "google") {
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
        content?: { parts?: { text?: string; inlineData?: { data: string; mimeType: string } }[] };
      }[];
    };
    const parts = data.candidates?.[0]?.content?.parts || [];
    const inline = parts.find((p) => p.inlineData)?.inlineData;
    const text = parts.find((p) => p.text)?.text;
    if (inline?.data) {
      const mediaUrl = await uploadBase64Media(
        inline.data,
        inline.mimeType || "image/png",
        opts.agent.id,
      );
      return {
        body: text || opts.prompt,
        metadata: { kind: opts.agent.kind, media_url: mediaUrl, provider: "google" },
      };
    }
    return { body: text || "No image returned.", metadata: { kind: opts.agent.kind } };
  }

  // OpenAI images
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.agent.model || "dall-e-3",
      prompt: opts.prompt,
      size: "1024x1024",
      n: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI image error: ${await res.text()}`);
  }
  const result = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
  const url = result.data?.[0]?.url;
  if (url) {
    return {
      body: opts.prompt,
      metadata: { kind: opts.agent.kind, media_url: url, provider: "openai" },
    };
  }
  const b64 = result.data?.[0]?.b64_json;
  if (b64) {
    const mediaUrl = await uploadBase64Media(b64, "image/png", opts.agent.id);
    return {
      body: opts.prompt,
      metadata: { kind: opts.agent.kind, media_url: mediaUrl, provider: "openai" },
    };
  }
  throw new Error("OpenAI image generation returned no media");
}

async function uploadBase64Media(b64: string, mime: string, agentId: string) {
  const admin = createAdminClient();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `${agentId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(b64, "base64");
  const { error } = await admin.storage.from("agent-media").upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  const { data } = admin.storage.from("agent-media").getPublicUrl(path);
  return data.publicUrl;
}

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
