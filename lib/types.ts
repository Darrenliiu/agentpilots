export type CommunityRole = "owner" | "admin" | "member";
export type CommunityVisibility = "public" | "private";
export type ChannelType = "public" | "private" | "dm";
export type AgentKind = "text" | "image" | "video";
export type AgentStatus = "active" | "disabled";
export type ConnectorAuthType = "oauth" | "bearer" | "none";
export type ConnectorAccountStatus = "connected" | "disconnected" | "error";

export type HandoffMetadata = {
  from_agent_id: string;
  to_agent_ids: string[];
  depth: number;
  root_message_id: string;
  chain_agent_ids: string[];
};

export type MessageComposerMetadata = {
  mentioned_agent_ids?: string[];
  connector_ids?: string[];
  skill_ids?: string[];
  image_agent_id?: string;
  handoff?: HandoffMetadata;
};

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
};

export type Community = {
  id: string;
  name: string;
  slug: string;
  description: string;
  avatar_url: string | null;
  visibility: CommunityVisibility;
  discoverable: boolean;
  theme: string;
  created_by: string;
  created_at: string;
};

export type Channel = {
  id: string;
  community_id: string;
  name: string;
  slug: string;
  type: ChannelType;
  created_by: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  channel_id: string;
  author_id: string | null;
  agent_id: string | null;
  body: string;
  metadata: Record<string, unknown>;
  client_message_id: string | null;
  created_at: string;
  author?: Profile | null;
  agent?: Agent | null;
};

export type Agent = {
  id: string;
  community_id: string;
  name: string;
  slug: string;
  system_prompt: string;
  kind: AgentKind;
  provider: string;
  model: string;
  status: AgentStatus;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  handoff_enabled?: boolean;
  handoff_max_depth?: number | null;
  handoff_block_cycles?: boolean;
  handoff_prompt_assist?: boolean;
};

export type AgentRunStatus = "pending" | "running" | "succeeded" | "failed";
export type AgentRunPhase =
  | "thinking"
  | "tool"
  | "reasoning"
  | "generating"
  | "sending"
  | "done"
  | "failed";

export type AgentRun = {
  id: string;
  message_id: string;
  agent_id: string;
  channel_id: string | null;
  community_id: string | null;
  status: AgentRunStatus;
  phase: AgentRunPhase | null;
  status_text: string | null;
  error: string | null;
  result_message_id: string | null;
  created_at: string;
  updated_at: string;
  agent?: Pick<Agent, "id" | "name" | "avatar_url"> | null;
};

export type Invite = {
  id: string;
  community_id: string;
  token: string;
  created_by: string;
  email: string | null;
  expires_at: string | null;
  is_reusable: boolean;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
};

export type ConnectorCatalogItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  mcp_url: string;
  auth_type: ConnectorAuthType;
  docs_url: string | null;
  created_at: string;
};

export type CommunityConnector = {
  id: string;
  community_id: string;
  catalog_id: string | null;
  name: string;
  slug: string;
  mcp_url: string;
  auth_type: ConnectorAuthType;
  enabled: boolean;
  allow_shared_secret: boolean;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
  catalog?: ConnectorCatalogItem | null;
  connected?: boolean;
  has_shared?: boolean;
};

export type UserConnectorAccount = {
  id: string;
  community_connector_id: string;
  user_id: string | null;
  is_shared: boolean;
  status: ConnectorAccountStatus;
  error: string | null;
  token_expires_at: string | null;
  created_at: string;
};

export type Skill = {
  id: string;
  community_id: string;
  name: string;
  description: string;
  body: string;
  source_url: string;
  source_registry: string | null;
  source_id: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
};

export const TEXT_PROVIDERS = [
  { id: "local", label: "Local (on-device)" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "google", label: "Google (Gemini)" },
  { id: "xai", label: "xAI (Grok)" },
  { id: "openrouter", label: "OpenRouter (Kimi & more)" },
  { id: "openai-compatible", label: "OpenAI-compatible / Cursor gateway" },
] as const;

export const DEFAULT_LOCAL_MODEL_ID = "qwen2.5-1.5b-instruct";
export const DEFAULT_LOCAL_LLM_BASE_URL = "http://127.0.0.1:11435/v1";

export const MEDIA_PROVIDERS = [
  { id: "openai", label: "OpenAI Images" },
  { id: "google", label: "Gemini Image" },
  { id: "higgsfield", label: "Higgsfield" },
  { id: "midjourney", label: "Midjourney (coming soon)", disabled: true },
] as const;
