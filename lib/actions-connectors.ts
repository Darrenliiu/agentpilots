"use server";

import { redirect } from "next/navigation";
import { encryptSecret } from "@/lib/agents/encrypt";
import {
  isConnectorAuthType,
  slugifyConnector,
  validateMcpUrl,
} from "@/lib/connectors/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { parseSkillMd } from "@/lib/skills/parse";
import {
  fetchSkillMdContent,
  resolveSkillMdFetchUrl,
} from "@/lib/skills/registry";

async function requireMember(communityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const, user: null, supabase };

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return { error: "Not a community member" as const, user: null, supabase };
  }
  return {
    error: null as null,
    user,
    supabase,
    role: membership.role as string,
    isAdmin: ["owner", "admin"].includes(membership.role),
  };
}

export async function enableCatalogConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const catalogId = String(formData.get("catalog_id") || "");
  if (!communityId || !catalogId) return { error: "Missing fields" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can enable connectors" };

  const { data: catalog } = await ctx.supabase
    .from("connector_catalog")
    .select("*")
    .eq("id", catalogId)
    .single();
  if (!catalog) return { error: "Catalog item not found" };

  const { data: existing } = await ctx.supabase
    .from("community_connectors")
    .select("id")
    .eq("community_id", communityId)
    .eq("slug", catalog.slug)
    .maybeSingle();

  if (existing) {
    const { error } = await ctx.supabase
      .from("community_connectors")
      .update({
        enabled: true,
        catalog_id: catalog.id,
        mcp_url: catalog.mcp_url,
        auth_type: catalog.auth_type,
        name: catalog.name,
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await ctx.supabase.from("community_connectors").insert({
      community_id: communityId,
      catalog_id: catalog.id,
      name: catalog.name,
      slug: catalog.slug,
      mcp_url: catalog.mcp_url,
      auth_type: catalog.auth_type,
      enabled: true,
      created_by: ctx.user.id,
    });
    if (error) return { error: error.message };
  }

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function addCustomConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const name = String(formData.get("name") || "").trim();
  const mcpUrlRaw = String(formData.get("mcp_url") || "").trim();
  const authTypeRaw = String(formData.get("auth_type") || "bearer");
  const allowShared = formData.get("allow_shared_secret") === "on";

  if (!communityId) return { error: "Community is required" };
  if (!name) return { error: "Name is required" };
  if (!isConnectorAuthType(authTypeRaw)) return { error: "Invalid auth type" };

  const validated = validateMcpUrl(mcpUrlRaw);
  if (!validated.ok) return { error: validated.error };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can add connectors" };

  let slug = slugifyConnector(name);
  const { data: clash } = await ctx.supabase
    .from("community_connectors")
    .select("id")
    .eq("community_id", communityId)
    .eq("slug", slug)
    .maybeSingle();
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const { error } = await ctx.supabase.from("community_connectors").insert({
    community_id: communityId,
    catalog_id: null,
    name,
    slug,
    mcp_url: validated.url,
    auth_type: authTypeRaw,
    enabled: true,
    allow_shared_secret: allowShared,
    created_by: ctx.user.id,
  });
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function updateCommunityConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const allowShared = formData.get("allow_shared_secret") === "on";

  if (!communityId || !connectorId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can update connectors" };

  const { error } = await ctx.supabase
    .from("community_connectors")
    .update({
      enabled: formData.has("enabled") ? enabled : undefined,
      allow_shared_secret: formData.has("allow_shared_secret")
        ? allowShared
        : undefined,
    })
    .eq("id", connectorId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function toggleCommunityConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  const enabled = formData.get("enabled") === "true";

  if (!communityId || !connectorId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can update connectors" };

  const { error } = await ctx.supabase
    .from("community_connectors")
    .update({ enabled })
    .eq("id", connectorId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function deleteCommunityConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  if (!communityId || !connectorId) return { error: "Missing fields" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can delete connectors" };

  const { error } = await ctx.supabase
    .from("community_connectors")
    .delete()
    .eq("id", connectorId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function connectBearerConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  const token = String(formData.get("access_token") || "").trim();
  const isShared = formData.get("is_shared") === "on";

  if (!communityId || !connectorId) return { error: "Missing fields" };
  if (!token) return { error: "Access token is required" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };

  const { data: connector } = await ctx.supabase
    .from("community_connectors")
    .select("*")
    .eq("id", connectorId)
    .eq("community_id", communityId)
    .single();
  if (!connector) return { error: "Connector not found" };

  if (connector.auth_type === "none") {
    return { error: "This connector does not need a token" };
  }

  if (isShared) {
    if (!ctx.isAdmin) return { error: "Only admins can set a shared secret" };
    if (!connector.allow_shared_secret) {
      return { error: "Shared secrets are not enabled for this connector" };
    }
  }

  const admin = createAdminClient();
  const encrypted = encryptSecret(token);

  if (isShared) {
    await admin
      .from("user_connector_accounts")
      .delete()
      .eq("community_connector_id", connectorId)
      .eq("is_shared", true);
    const { error } = await admin.from("user_connector_accounts").insert({
      community_connector_id: connectorId,
      user_id: null,
      is_shared: true,
      encrypted_access_token: encrypted,
      status: "connected",
      error: null,
    });
    if (error) return { error: error.message };
  } else {
    const { data: existing } = await admin
      .from("user_connector_accounts")
      .select("id")
      .eq("community_connector_id", connectorId)
      .eq("user_id", ctx.user.id)
      .eq("is_shared", false)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from("user_connector_accounts")
        .update({
          encrypted_access_token: encrypted,
          status: "connected",
          error: null,
        })
        .eq("id", existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await admin.from("user_connector_accounts").insert({
        community_connector_id: connectorId,
        user_id: ctx.user.id,
        is_shared: false,
        encrypted_access_token: encrypted,
        status: "connected",
        error: null,
      });
      if (error) return { error: error.message };
    }
  }

  // For auth_type none we wouldn't be here; for oauth, bearer tokens also work as fallback
  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function connectNoneConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  if (!communityId || !connectorId) return { error: "Missing fields" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("user_connector_accounts")
    .select("id")
    .eq("community_connector_id", connectorId)
    .eq("user_id", ctx.user.id)
    .eq("is_shared", false)
    .maybeSingle();

  if (existing) {
    await admin
      .from("user_connector_accounts")
      .update({ status: "connected", error: null })
      .eq("id", existing.id);
  } else {
    const { error } = await admin.from("user_connector_accounts").insert({
      community_connector_id: connectorId,
      user_id: ctx.user.id,
      is_shared: false,
      status: "connected",
      error: null,
    });
    if (error) return { error: error.message };
  }

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function disconnectConnectorAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  const isShared = formData.get("is_shared") === "true";

  if (!communityId || !connectorId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };

  if (isShared) {
    if (!ctx.isAdmin) return { error: "Only admins can remove shared secrets" };
    const { error } = await ctx.supabase
      .from("user_connector_accounts")
      .delete()
      .eq("community_connector_id", connectorId)
      .eq("is_shared", true);
    if (error) return { error: error.message };
  } else {
    const { error } = await ctx.supabase
      .from("user_connector_accounts")
      .delete()
      .eq("community_connector_id", connectorId)
      .eq("user_id", ctx.user.id)
      .eq("is_shared", false);
    if (error) return { error: error.message };
  }

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function importSkillFromRegistryAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const sourceUrl = String(formData.get("source_url") || "").trim();
  const skillMdUrl = String(formData.get("skill_md_url") || "").trim() || null;
  const sourceRegistry = String(formData.get("source_registry") || "custom");
  const sourceId = String(formData.get("source_id") || "").trim() || null;
  const nameOverride = String(formData.get("name") || "").trim();
  const descriptionOverride = String(formData.get("description") || "").trim();

  if (!communityId) return { error: "Community is required" };
  if (!sourceUrl) return { error: "Source URL is required" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can import skills" };

  try {
    const fetchUrl = resolveSkillMdFetchUrl({
      source_url: sourceUrl,
      skill_md_url: skillMdUrl,
    });
    const raw = await fetchSkillMdContent(fetchUrl);
    const parsed = parseSkillMd(raw);

    const { error } = await ctx.supabase.from("skills").insert({
      community_id: communityId,
      name: nameOverride || parsed.name,
      description: descriptionOverride || parsed.description,
      body: parsed.body,
      source_url: sourceUrl,
      source_registry: sourceRegistry,
      source_id: sourceId,
      enabled: true,
      created_by: ctx.user.id,
    });
    if (error) return { error: error.message };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to import skill",
    };
  }

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/skills`);
}

export async function createCustomSkillAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const sourceUrl = String(formData.get("source_url") || "").trim();

  if (!communityId) return { error: "Community is required" };
  if (!name) return { error: "Name is required" };
  if (!body) return { error: "Skill body is required" };
  if (!sourceUrl) return { error: "Source URL is required (link back to origin)" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can add skills" };

  const { error } = await ctx.supabase.from("skills").insert({
    community_id: communityId,
    name,
    description,
    body,
    source_url: sourceUrl,
    source_registry: "custom",
    source_id: null,
    enabled: true,
    created_by: ctx.user.id,
  });
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/skills`);
}

export async function toggleSkillAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const skillId = String(formData.get("skill_id") || "");
  const enabled = formData.get("enabled") === "true";

  if (!communityId || !skillId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can update skills" };

  const { error } = await ctx.supabase
    .from("skills")
    .update({ enabled })
    .eq("id", skillId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/skills`);
}

export async function deleteSkillAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const skillId = String(formData.get("skill_id") || "");
  if (!communityId || !skillId) return { error: "Missing fields" };

  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can delete skills" };

  const { error } = await ctx.supabase
    .from("skills")
    .delete()
    .eq("id", skillId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/skills`);
}

export async function setConnectorSharedSecretFlagAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const connectorId = String(formData.get("connector_id") || "");
  const allow = formData.get("allow_shared_secret") === "true";

  if (!communityId || !connectorId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can update connectors" };

  const { error } = await ctx.supabase
    .from("community_connectors")
    .update({ allow_shared_secret: allow })
    .eq("id", connectorId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  const { data: community } = await ctx.supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings/connectors`);
}

export async function updateAgentDefaultsAction(
  communityId: string,
  formData: FormData,
) {
  const agentId = String(formData.get("agent_id") || "");
  const connectorIds = formData.getAll("connector_ids").map(String);
  const skillIds = formData.getAll("skill_ids").map(String);

  if (!communityId || !agentId) return { error: "Missing fields" };
  const ctx = await requireMember(communityId);
  if (ctx.error || !ctx.user) return { error: ctx.error || "Not authenticated" };
  if (!ctx.isAdmin) return { error: "Only admins can update agents" };

  await ctx.supabase
    .from("agent_default_connectors")
    .delete()
    .eq("agent_id", agentId);
  await ctx.supabase.from("agent_default_skills").delete().eq("agent_id", agentId);

  if (connectorIds.length) {
    const { error } = await ctx.supabase.from("agent_default_connectors").insert(
      connectorIds.map((community_connector_id) => ({
        agent_id: agentId,
        community_connector_id,
      })),
    );
    if (error) return { error: error.message };
  }
  if (skillIds.length) {
    const { error } = await ctx.supabase.from("agent_default_skills").insert(
      skillIds.map((skill_id) => ({ agent_id: agentId, skill_id })),
    );
    if (error) return { error: error.message };
  }

  return { ok: true as const };
}
