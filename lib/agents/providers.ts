import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createXai } from "@ai-sdk/xai";
import { generateText, stepCountIs, type ToolSet } from "ai";
import type { Agent } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

export type AgentTokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export async function generateAgentTextReply(opts: {
  agent: Agent;
  apiKey: string;
  baseUrl?: string | null;
  systemPrompt: string;
  userPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
  tools?: ToolSet;
  maxSteps?: number;
}): Promise<{ text: string; warnings: string[]; usage: AgentTokenUsage | null }> {
  const model = getLanguageModel(opts.agent, opts.apiKey, opts.baseUrl);
  const warnings: string[] = [];
  const hasTools = opts.tools && Object.keys(opts.tools).length > 0;

  if (hasTools && opts.agent.provider === "local") {
    warnings.push(
      "Connectors require a tool-capable cloud model; local agent ran without MCP tools.",
    );
  }

  const useTools = hasTools && opts.agent.provider !== "local";

  const { text, usage } = await generateText({
    model,
    system: opts.systemPrompt || `You are ${opts.agent.name}, a helpful community agent.`,
    messages: [
      ...opts.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: opts.userPrompt },
    ],
    ...(useTools
      ? {
          tools: opts.tools,
          stopWhen: stepCountIs(opts.maxSteps ?? 8),
        }
      : {}),
  });

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
