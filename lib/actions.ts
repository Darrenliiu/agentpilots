"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/agents/encrypt";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  agentAvatarPath,
  communityAvatarPath,
  uploadAvatarFile,
  userAvatarPath,
} from "@/lib/avatars";
import type { CommunityRole, CommunityVisibility } from "@/lib/types";
import { isCommunityThemeId } from "@/lib/community-themes";
import {
  REMEMBER_ME_COOKIE,
  rememberMeCookieOptions,
} from "@/lib/supabase/remember-me";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  FREE_MAX_AGENTS,
  isProPlan,
  maxAvatarBytes,
} from "@/lib/billing";
import { syncCommunitySeatQuantity } from "@/lib/billing-stripe";
import { siteOrigin } from "@/lib/site-url";

function absoluteJoinUrl(token: string) {
  return `${siteOrigin()}/join/${token}` as const;
}

async function setRememberMePreference(remember: boolean) {
  const cookieStore = await cookies();
  cookieStore.set(
    REMEMBER_ME_COOKIE,
    remember ? "1" : "0",
    rememberMeCookieOptions(remember),
  );
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const next = safeRedirectPath(String(formData.get("next") || ""), "/home");
  // New accounts stay signed in across browser restarts by default.
  await setRememberMePreference(true);
  const supabase = await createClient({ rememberMe: true });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || email.split("@")[0] } },
  });
  if (error) return { error: error.message };
  if (!data.session) {
    return {
      error:
        "Account created, but you are not signed in yet. If email confirmation is enabled, check your inbox — otherwise try logging in.",
    };
  }
  redirect(next);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = safeRedirectPath(String(formData.get("next") || ""), "/home");
  const remember = formData.get("remember_me") === "on";
  // Set preference before sign-in so auth cookies pick up the right lifetime.
  await setRememberMePreference(remember);
  const supabase = await createClient({ rememberMe: remember });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next);
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Email is required" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteOrigin()}/auth/callback?next=/auth/reset`,
  });
  if (error) return { error: error.message };
  return {
    ok: true as const,
    message: "If an account exists for that email, a reset link is on the way.",
  };
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match" };
  }
  const supabase = await createClient({ rememberMe: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: "Reset link expired or invalid. Request a new password reset.",
    };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect("/home");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.set(REMEMBER_ME_COOKIE, "", {
    ...rememberMeCookieOptions(false),
    maxAge: 0,
  });
  redirect("/login");
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const displayName = String(formData.get("display_name") || "").trim();
  if (!displayName) return { error: "Display name is required" };

  const avatar = formData.get("avatar");
  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    const uploaded = await uploadAvatarFile(
      userAvatarPath(user.id, avatar.type),
      avatar,
    );
    if (uploaded.error) return { error: uploaded.error };
    avatarUrl = uploaded.publicUrl;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", user.id);

  if (error) return { error: error.message };
  const next = safeRedirectPath(
    String(formData.get("next") || ""),
    "/settings/profile",
  );
  redirect(next);
}

export async function createCommunityAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Name is required");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_community", { p_name: name });
  if (error) throw new Error(error.message);
  const community = data as { slug: string };
  redirect(`/c/${community.slug}`);
}

export async function updateCommunitySettingsAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const visibility = String(formData.get("visibility") || "private") as CommunityVisibility;
  const discoverable = formData.get("discoverable") === "on";
  const theme = String(formData.get("theme") || "default");

  if (!communityId) return { error: "Community is required" };
  if (!name) return { error: "Name is required" };
  if (visibility !== "public" && visibility !== "private") {
    return { error: "Visibility must be public or private" };
  }
  if (!isCommunityThemeId(theme)) {
    return { error: "Invalid theme" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only admins can update community settings" };
  }

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  if (!community) return { error: "Community not found" };

  const { data: billingRow } = await supabase
    .from("communities")
    .select("plan")
    .eq("id", communityId)
    .single();

  let avatarUrl: string | undefined;
  const avatar = formData.get("avatar");
  if (avatar instanceof File && avatar.size > 0) {
    const uploaded = await uploadAvatarFile(
      communityAvatarPath(communityId, avatar.type),
      avatar,
      { maxBytes: maxAvatarBytes(billingRow?.plan) },
    );
    if (uploaded.error) return { error: uploaded.error };
    avatarUrl = uploaded.publicUrl;
  }

  const { error } = await supabase
    .from("communities")
    .update({
      name,
      description,
      visibility,
      discoverable,
      theme,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    })
    .eq("id", communityId);

  if (error) return { error: error.message };
  revalidatePath(`/c/${community.slug}`, "layout");
  return;
}

export async function updateMemberRoleAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const targetUserId = String(formData.get("user_id") || "");
  const newRole = String(formData.get("role") || "") as CommunityRole;

  if (!communityId || !targetUserId) return { error: "Missing member" };
  if (!["owner", "admin", "member"].includes(newRole)) {
    return { error: "Invalid role" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: actor } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actor || actor.role !== "owner") {
    return { error: "Only owners can change roles" };
  }

  const { data: target } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!target) return { error: "Member not found" };

  if (target.role === "owner" && newRole !== "owner") {
    const { count } = await supabase
      .from("community_members")
      .select("*", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("role", "owner");
    if ((count || 0) <= 1) {
      return { error: "Cannot demote the last owner" };
    }
  }

  const { error } = await supabase
    .from("community_members")
    .update({ role: newRole })
    .eq("community_id", communityId)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings`);
}

export async function removeMemberAction(formData: FormData) {
  const communityId = String(formData.get("community_id") || "");
  const targetUserId = String(formData.get("user_id") || "");

  if (!communityId || !targetUserId) return { error: "Missing member" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const isSelf = user.id === targetUserId;

  const { data: actor } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!actor) return { error: "Not a member" };
  if (!isSelf && !["owner", "admin"].includes(actor.role)) {
    return { error: "Only admins can remove members" };
  }

  const { data: target } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!target) return { error: "Member not found" };

  if (!isSelf && actor.role === "admin" && target.role !== "member") {
    return { error: "Admins can only remove members" };
  }

  if (target.role === "owner") {
    const { count } = await supabase
      .from("community_members")
      .select("*", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("role", "owner");
    if ((count || 0) <= 1) {
      return { error: "Cannot remove the last owner" };
    }
  }

  const { error } = await supabase
    .from("community_members")
    .delete()
    .eq("community_id", communityId)
    .eq("user_id", targetUserId);

  if (error) return { error: error.message };

  try {
    await syncCommunitySeatQuantity(communityId);
  } catch (err) {
    console.error("[billing] seat sync after remove", err);
  }

  if (isSelf) redirect("/home");

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  redirect(`/c/${community?.slug}/settings`);
}

export async function acceptInviteAction(token: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/join/${token}`);

  const { data: communityId, error } = await supabase.rpc("accept_invite", {
    p_token: token,
  });
  if (error) return { error: error.message };

  try {
    await syncCommunitySeatQuantity(String(communityId));
  } catch (err) {
    console.error("[billing] seat sync after invite", err);
  }

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  if (community?.slug) {
    revalidatePath(`/c/${community.slug}`, "layout");
  }
  redirect(`/c/${community?.slug || "home"}`);
}

export async function joinPublicCommunityAction(communityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/discover");

  const { data: joinedId, error } = await supabase.rpc("join_public_community", {
    p_community_id: communityId,
  });
  if (error) return { error: error.message };

  try {
    await syncCommunitySeatQuantity(String(joinedId));
  } catch (err) {
    console.error("[billing] seat sync after join", err);
  }

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", joinedId)
    .single();
  if (community?.slug) {
    revalidatePath(`/c/${community.slug}`, "layout");
  }
  redirect(`/c/${community?.slug || "home"}`);
}

function parseJoinInput(raw: string):
  | { kind: "invite"; token: string }
  | { kind: "community"; slug: string }
  | { kind: "invalid" } {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid" };

  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      path = new URL(trimmed).pathname;
    }
  } catch {
    return { kind: "invalid" };
  }

  path = path.split("?")[0].split("#")[0];

  const inviteMatch = path.match(/\/join\/([^/]+)\/?$/i);
  if (inviteMatch?.[1]) {
    return { kind: "invite", token: inviteMatch[1] };
  }

  const communityMatch = path.match(/\/c\/([^/]+)\/?/i);
  if (communityMatch?.[1]) {
    return { kind: "community", slug: communityMatch[1] };
  }

  // Bare slug or token-looking string (no slashes)
  if (/^[a-z0-9][a-z0-9_-]*$/i.test(trimmed) && !trimmed.includes("/")) {
    return { kind: "community", slug: trimmed };
  }

  return { kind: "invalid" };
}

async function joinCommunityBySlug(slug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join?c=${slug}`)}`);
  }

  const { data: community } = await supabase
    .from("communities")
    .select("id, slug, visibility")
    .eq("slug", slug)
    .maybeSingle();

  if (!community) {
    return { error: "Community not found. Check the URL or slug and try again." };
  }

  const { data: membership } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership) {
    redirect(`/c/${community.slug}`);
  }

  if (community.visibility !== "public") {
    return {
      error:
        "This community is private. Paste an invite link to join, or ask an admin for one.",
    };
  }

  const { error } = await supabase.rpc("join_public_community", {
    p_community_id: community.id,
  });
  if (error) return { error: error.message };

  try {
    await syncCommunitySeatQuantity(community.id);
  } catch (err) {
    console.error("[billing] seat sync after join by slug", err);
  }

  revalidatePath(`/c/${community.slug}`, "layout");
  redirect(`/c/${community.slug}`);
}

export async function resolveJoinLinkAction(formData: FormData) {
  const input = String(formData.get("link") || "");
  const parsed = parseJoinInput(input);

  if (parsed.kind === "invalid") {
    return {
      error:
        "Enter a valid invite link (/join/…), community URL (/c/…), or community slug.",
    };
  }

  if (parsed.kind === "invite") {
    redirect(`/join/${parsed.token}`);
  }

  return joinCommunityBySlug(parsed.slug);
}

export async function joinCommunityBySlugAction(slug: string) {
  return joinCommunityBySlug(slug);
}

export type ShareLinkExpiryPreset = "1d" | "7d" | "14d" | "30d" | "never";

const SHARE_LINK_EXPIRY_MS: Record<
  Exclude<ShareLinkExpiryPreset, "never">,
  number
> = {
  "1d": 1 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

function expiresAtFromPreset(preset: ShareLinkExpiryPreset): string | null {
  if (preset === "never") return null;
  return new Date(Date.now() + SHARE_LINK_EXPIRY_MS[preset]).toISOString();
}

function isShareLinkExpiryPreset(value: string): value is ShareLinkExpiryPreset {
  return ["1d", "7d", "14d", "30d", "never"].includes(value);
}

async function requireCommunityMember(communityId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: membership } = await supabase
    .from("community_members")
    .select("user_id, role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a community member" as const };

  return { supabase, user, membership };
}

async function requireCommunityAdmin(communityId: string) {
  const result = await requireCommunityMember(communityId);
  if ("error" in result) return result;
  if (!["owner", "admin"].includes(result.membership.role)) {
    return { error: "Only admins can manage invite links" as const };
  }
  return result;
}

function isActiveShareInvite(invite: {
  is_reusable: boolean;
  expires_at: string | null;
}) {
  if (!invite.is_reusable) return false;
  if (invite.expires_at == null) return true;
  return new Date(invite.expires_at).getTime() > Date.now();
}

export async function createInviteAction(communityId: string, formData: FormData) {
  const email = String(formData.get("email") || "").trim() || null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data, error } = await supabase
    .from("invites")
    .insert({
      community_id: communityId,
      created_by: user.id,
      email,
      is_reusable: false,
    })
    .select("token")
    .single();
  if (error) return { error: error.message };
  return { token: data.token as string };
}

/** Any community member can copy a share link; reuses an open reusable invite when possible. */
export async function getOrCreateCommunityShareLinkAction(
  communityId: string,
): Promise<
  | { error: string }
  | {
      path: string;
      url: string;
      inviteId: string;
      expiresAt: string | null;
    }
> {
  const auth = await requireCommunityMember(communityId);
  if ("error" in auth) {
    return { error: auth.error || "Not a community member" };
  }

  const { supabase, user } = auth;

  const { data: existingRows } = await supabase
    .from("invites")
    .select("id, token, expires_at, is_reusable")
    .eq("community_id", communityId)
    .eq("is_reusable", true)
    .order("created_at", { ascending: false })
    .limit(10);

  const existing = (existingRows || []).find(isActiveShareInvite);

  if (existing?.token) {
    const token = existing.token as string;
    return {
      path: `/join/${token}`,
      url: absoluteJoinUrl(token),
      inviteId: existing.id as string,
      expiresAt: (existing.expires_at as string | null) ?? null,
    };
  }

  // RLS only lets admins insert invites; use admin client after membership check.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invites")
    .insert({
      community_id: communityId,
      created_by: user.id,
      email: null,
      is_reusable: true,
      expires_at: expiresAtFromPreset("never"),
    })
    .select("id, token, expires_at")
    .single();
  if (error) return { error: error.message };
  if (!data?.token) return { error: "Could not create invite link" };
  return {
    path: `/join/${data.token}`,
    url: absoluteJoinUrl(data.token),
    inviteId: data.id as string,
    expiresAt: (data.expires_at as string | null) ?? null,
  };
}

export async function updateCommunityShareLinkExpiryAction(
  communityId: string,
  expiresIn: ShareLinkExpiryPreset,
) {
  if (!isShareLinkExpiryPreset(expiresIn)) {
    return { error: "Invalid expiry option" };
  }

  const auth = await requireCommunityAdmin(communityId);
  if ("error" in auth) return { error: auth.error };

  const link = await getOrCreateCommunityShareLinkAction(communityId);
  if ("error" in link && link.error) return { error: link.error };
  if (!("inviteId" in link) || !link.inviteId) {
    return { error: "Could not find share link" };
  }

  const expiresAt = expiresAtFromPreset(expiresIn);
  const { error } = await auth.supabase
    .from("invites")
    .update({ expires_at: expiresAt })
    .eq("id", link.inviteId)
    .eq("community_id", communityId);
  if (error) return { error: error.message };

  return {
    path: link.path,
    url: link.url,
    inviteId: link.inviteId,
    expiresAt,
  };
}

export async function regenerateCommunityShareLinkAction(
  communityId: string,
  expiresIn: ShareLinkExpiryPreset = "never",
) {
  if (!isShareLinkExpiryPreset(expiresIn)) {
    return { error: "Invalid expiry option" };
  }

  const auth = await requireCommunityAdmin(communityId);
  if ("error" in auth) return { error: auth.error };
  const { supabase, user } = auth;

  const now = new Date().toISOString();
  const { data: reusableRows } = await supabase
    .from("invites")
    .select("id, expires_at, is_reusable")
    .eq("community_id", communityId)
    .eq("is_reusable", true);

  const activeIds = (reusableRows || [])
    .filter(isActiveShareInvite)
    .map((row) => row.id);
  if (activeIds.length) {
    const { error: revokeError } = await supabase
      .from("invites")
      .update({ expires_at: now })
      .in("id", activeIds);
    if (revokeError) return { error: revokeError.message };
  }

  const { data, error } = await supabase
    .from("invites")
    .insert({
      community_id: communityId,
      created_by: user.id,
      email: null,
      is_reusable: true,
      expires_at: expiresAtFromPreset(expiresIn),
    })
    .select("id, token, expires_at")
    .single();
  if (error) return { error: error.message };

  return {
    path: `/join/${data.token}` as const,
    url: absoluteJoinUrl(data.token),
    inviteId: data.id as string,
    expiresAt: (data.expires_at as string | null) ?? null,
  };
}

function slugifyChannelName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "channel"
  );
}

async function assertChannelAdminAccess(channelId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, community_id, name, slug, type, communities(slug)")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return { error: "Channel not found" as const };
  if (channel.type === "dm") {
    return { error: "Direct messages cannot be edited here" as const };
  }

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", channel.community_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a community member" as const };
  if (!["owner", "admin"].includes(membership.role)) {
    return { error: "Only admins can manage channels" as const };
  }

  const community = channel.communities as unknown as { slug: string } | null;
  return {
    user,
    channel,
    communitySlug: community?.slug || null,
    supabase,
  };
}

export async function createChannelAction(communityId: string, formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "public") as "public" | "private";
  if (!name) throw new Error("Name is required");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const slug = slugifyChannelName(name);

  const { data: channel, error } = await supabase
    .from("channels")
    .insert({
      community_id: communityId,
      name,
      slug,
      type,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("channel_members").insert({
    channel_id: channel.id,
    user_id: user.id,
  });

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  revalidatePath(`/c/${community?.slug}`, "layout");
  redirect(`/c/${community?.slug}/${channel.slug}`);
}

export async function updateChannelAction(input: {
  channelId: string;
  name: string;
  type: "public" | "private";
}) {
  const name = input.name.trim();
  if (!name) return { error: "Name is required" };
  if (input.type !== "public" && input.type !== "private") {
    return { error: "Type must be public or private" };
  }

  const access = await assertChannelAdminAccess(input.channelId);
  if ("error" in access) return { error: access.error };

  const { channel, communitySlug, supabase } = access;
  const slug = slugifyChannelName(name);

  if (slug !== channel.slug) {
    const { data: clash } = await supabase
      .from("channels")
      .select("id")
      .eq("community_id", channel.community_id)
      .eq("slug", slug)
      .neq("id", channel.id)
      .maybeSingle();
    if (clash) return { error: "A channel with that name already exists" };
  }

  const { error } = await supabase
    .from("channels")
    .update({ name, slug, type: input.type })
    .eq("id", channel.id);
  if (error) return { error: error.message };

  if (input.type === "private") {
    await supabase.from("channel_members").upsert(
      { channel_id: channel.id, user_id: access.user.id },
      { onConflict: "channel_id,user_id", ignoreDuplicates: true },
    );
  }

  if (communitySlug) {
    revalidatePath(`/c/${communitySlug}`, "layout");
    if (slug !== channel.slug) {
      redirect(`/c/${communitySlug}/${slug}`);
    }
  }

  return { ok: true as const, slug };
}

export async function deleteChannelAction(channelId: string) {
  const access = await assertChannelAdminAccess(channelId);
  if ("error" in access) return { error: access.error };

  const { channel, communitySlug, supabase } = access;

  const { count, error: countError } = await supabase
    .from("channels")
    .select("id", { count: "exact", head: true })
    .eq("community_id", channel.community_id)
    .neq("type", "dm");
  if (countError) return { error: countError.message };
  if ((count ?? 0) <= 1) {
    return { error: "You need at least one channel in the community" };
  }

  const { data: fallback } = await supabase
    .from("channels")
    .select("slug")
    .eq("community_id", channel.community_id)
    .neq("type", "dm")
    .neq("id", channel.id)
    .order("name")
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("channels").delete().eq("id", channel.id);
  if (error) return { error: error.message };

  if (communitySlug) {
    revalidatePath(`/c/${communitySlug}`, "layout");
    redirect(`/c/${communitySlug}/${fallback?.slug || "general"}`);
  }

  return { ok: true as const };
}

export async function createDmAction(communityId: string, otherUserId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  if (otherUserId === user.id) return { error: "Cannot DM yourself" };

  const { data: membership } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a community member" };

  const { data: otherMembership } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", otherUserId)
    .maybeSingle();
  if (!otherMembership) return { error: "User is not in this community" };

  const ids = [user.id, otherUserId].sort();
  const slug = `dm-${ids.join("-").slice(0, 48)}`;

  const { data: existing } = await supabase
    .from("channels")
    .select("id, slug")
    .eq("community_id", communityId)
    .eq("slug", slug)
    .maybeSingle();

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();

  if (existing) {
    redirect(`/c/${community?.slug}/${existing.slug}`);
  }

  const { data: other } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", otherUserId)
    .single();

  const { data: channel, error } = await supabase
    .from("channels")
    .insert({
      community_id: communityId,
      name: other?.display_name || "Direct message",
      slug,
      type: "dm",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  // Service role: RLS only allows inserting yourself as a channel member.
  const admin = createAdminClient();
  const { error: membersError } = await admin.from("channel_members").insert([
    { channel_id: channel.id, user_id: user.id },
    { channel_id: channel.id, user_id: otherUserId },
  ]);
  if (membersError) return { error: membersError.message };

  redirect(`/c/${community?.slug}/${channel.slug}`);
}

export async function createAgentDmAction(communityId: string, agentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: membership } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a community member" };

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, status, community_id")
    .eq("id", agentId)
    .eq("community_id", communityId)
    .maybeSingle();
  if (!agent) return { error: "Agent not found" };
  if (agent.status !== "active") return { error: "Agent is disabled" };

  const slug = `dma-${user.id.replace(/-/g, "").slice(0, 12)}-${agentId.replace(/-/g, "").slice(0, 12)}`;

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();

  const { data: existing } = await supabase
    .from("channels")
    .select("id, slug")
    .eq("community_id", communityId)
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    redirect(`/c/${community?.slug}/${existing.slug}`);
  }

  const { data: channel, error } = await supabase
    .from("channels")
    .insert({
      community_id: communityId,
      name: agent.name,
      slug,
      type: "dm",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return { error: error.message };

  const admin = createAdminClient();
  const { error: memberError } = await admin.from("channel_members").insert({
    channel_id: channel.id,
    user_id: user.id,
  });
  if (memberError) return { error: memberError.message };

  const { error: linkError } = await admin.from("agent_channels").insert({
    agent_id: agent.id,
    channel_id: channel.id,
  });
  if (linkError) return { error: linkError.message };

  redirect(`/c/${community?.slug}/${channel.slug}`);
}

async function assertChannelInviteAccess(channelId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };

  const { data: channel } = await supabase
    .from("channels")
    .select("id, community_id, slug, type, communities(slug)")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return { error: "Channel not found" as const };
  if (channel.type === "dm") {
    return { error: "Cannot invite to a direct message" as const };
  }

  const { data: membership } = await supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", channel.community_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) return { error: "Not a community member" as const };

  if (channel.type === "private") {
    const { data: channelMember } = await supabase
      .from("channel_members")
      .select("user_id")
      .eq("channel_id", channelId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!channelMember) return { error: "Not a channel member" as const };
  }

  const community = channel.communities as unknown as { slug: string } | null;
  return {
    user,
    channel,
    communitySlug: community?.slug || null,
    supabase,
  };
}

export async function addAgentsToChannelAction(input: {
  channelId: string;
  agentIds: string[];
}) {
  const access = await assertChannelInviteAccess(input.channelId);
  if ("error" in access) return { error: access.error };

  const agentIds = [...new Set(input.agentIds.filter(Boolean))];
  if (!agentIds.length) return { error: "Select at least one agent" };

  const { data: agents, error: agentsError } = await access.supabase
    .from("agents")
    .select("id")
    .eq("community_id", access.channel.community_id)
    .in("id", agentIds);
  if (agentsError) return { error: agentsError.message };

  const validIds = (agents || []).map((a) => a.id);
  if (!validIds.length) return { error: "No valid agents selected" };

  const { data: existing } = await access.supabase
    .from("agent_channels")
    .select("agent_id")
    .eq("channel_id", input.channelId)
    .in("agent_id", validIds);
  const already = new Set((existing || []).map((row) => row.agent_id));
  const toInsert = validIds
    .filter((id) => !already.has(id))
    .map((agent_id) => ({ agent_id, channel_id: input.channelId }));

  if (toInsert.length) {
    const admin = createAdminClient();
    const { error } = await admin.from("agent_channels").insert(toInsert);
    if (error) return { error: error.message };
  }

  if (access.communitySlug) {
    revalidatePath(`/c/${access.communitySlug}/${access.channel.slug}`);
    revalidatePath(`/c/${access.communitySlug}`, "layout");
  }
  return { ok: true as const };
}

export async function addPeopleToChannelAction(input: {
  channelId: string;
  userIds: string[];
}) {
  const access = await assertChannelInviteAccess(input.channelId);
  if ("error" in access) return { error: access.error };

  const userIds = [
    ...new Set(
      input.userIds.filter((id) => id && id !== access.user.id),
    ),
  ];
  if (!userIds.length) return { error: "Select at least one person" };

  const { data: members, error: membersError } = await access.supabase
    .from("community_members")
    .select("user_id")
    .eq("community_id", access.channel.community_id)
    .in("user_id", userIds);
  if (membersError) return { error: membersError.message };

  const validIds = (members || []).map((m) => m.user_id);
  if (!validIds.length) return { error: "No valid members selected" };

  const { data: existing } = await access.supabase
    .from("channel_members")
    .select("user_id")
    .eq("channel_id", input.channelId)
    .in("user_id", validIds);
  const already = new Set((existing || []).map((row) => row.user_id));
  const toInsert = validIds
    .filter((id) => !already.has(id))
    .map((user_id) => ({ channel_id: input.channelId, user_id }));

  if (toInsert.length) {
    const admin = createAdminClient();
    const { error } = await admin.from("channel_members").insert(toInsert);
    if (error) return { error: error.message };
  }

  if (access.communitySlug) {
    revalidatePath(`/c/${access.communitySlug}/${access.channel.slug}`);
    revalidatePath(`/c/${access.communitySlug}`, "layout");
  }
  return { ok: true as const };
}

export async function upsertAgentAction(communityId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const id = String(formData.get("id") || "") || null;
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "text");
  const provider = String(formData.get("provider") || "openai");
  const model = String(formData.get("model") || "").trim();
  const systemPrompt = String(formData.get("system_prompt") || "");
  const apiKey = String(formData.get("api_key") || "").trim();
  const baseUrl = String(formData.get("base_url") || "").trim() || null;
  const channelIds = formData.getAll("channel_ids").map(String);
  const connectorIds = formData.getAll("connector_ids").map(String);
  const skillIds = formData.getAll("skill_ids").map(String);
  const handoffTargetIds = formData.getAll("handoff_target_ids").map(String);
  const status = String(formData.get("status") || "active");
  const handoffEnabled =
    kind === "text" && formData.get("handoff_enabled") === "true";
  const handoffUnlimited =
    !handoffEnabled || formData.get("handoff_unlimited") === "true";
  const handoffMaxDepthRaw = Number(
    String(formData.get("handoff_max_depth") || "").trim(),
  );
  const handoffMaxDepth =
    handoffEnabled && !handoffUnlimited && Number.isFinite(handoffMaxDepthRaw)
      ? Math.max(1, Math.floor(handoffMaxDepthRaw))
      : null;
  const handoffBlockCycles =
    !handoffEnabled || formData.get("handoff_block_cycles") === "true";
  const handoffPromptAssist =
    !handoffEnabled || formData.get("handoff_prompt_assist") === "true";

  if (!name) return { error: "Name is required" };
  if (provider !== "local" && !id && !apiKey) {
    return { error: "API key is required" };
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const resolvedBaseUrl =
    provider === "local"
      ? process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:11435/v1"
      : baseUrl;

  const payload = {
    community_id: communityId,
    name,
    slug: slug || "agent",
    kind,
    provider,
    model: model || defaultModel(provider, kind),
    system_prompt: systemPrompt,
    status,
    created_by: user.id,
    handoff_enabled: handoffEnabled,
    handoff_max_depth: handoffMaxDepth,
    handoff_block_cycles: handoffBlockCycles,
    handoff_prompt_assist: handoffPromptAssist,
  };

  let agentId = id;
  if (id) {
    const { error } = await supabase
      .from("agents")
      .update({
        name: payload.name,
        slug: payload.slug,
        kind: payload.kind,
        provider: payload.provider,
        model: payload.model,
        system_prompt: payload.system_prompt,
        status: payload.status,
        handoff_enabled: payload.handoff_enabled,
        handoff_max_depth: payload.handoff_max_depth,
        handoff_block_cycles: payload.handoff_block_cycles,
        handoff_prompt_assist: payload.handoff_prompt_assist,
      })
      .eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data: communityBilling } = await supabase
      .from("communities")
      .select("plan, slug")
      .eq("id", communityId)
      .single();

    if (!isProPlan(communityBilling?.plan)) {
      const { count } = await supabase
        .from("agents")
        .select("*", { count: "exact", head: true })
        .eq("community_id", communityId);
      if ((count || 0) >= FREE_MAX_AGENTS) {
        return {
          error: `Free communities are limited to ${FREE_MAX_AGENTS} agents. Upgrade to Pro for unlimited agents.`,
        };
      }
    }

    const { data, error } = await supabase.from("agents").insert(payload).select("id").single();
    if (error) return { error: error.message };
    agentId = data.id;
  }

  const avatar = formData.get("avatar");
  if (agentId && avatar instanceof File && avatar.size > 0) {
    const { data: planRow } = await supabase
      .from("communities")
      .select("plan")
      .eq("id", communityId)
      .single();
    const uploaded = await uploadAvatarFile(
      agentAvatarPath(communityId, agentId, avatar.type),
      avatar,
      { maxBytes: maxAvatarBytes(planRow?.plan) },
    );
    if (uploaded.error) return { error: uploaded.error };
    if (uploaded.publicUrl) {
      const { error } = await supabase
        .from("agents")
        .update({ avatar_url: uploaded.publicUrl })
        .eq("id", agentId);
      if (error) return { error: error.message };
    }
  }

  if (agentId && (provider === "local" || apiKey || baseUrl !== null)) {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("agent_secrets")
      .select("encrypted_api_key, base_url")
      .eq("agent_id", agentId)
      .maybeSingle();

    if (provider === "local") {
      await admin.from("agent_secrets").upsert({
        agent_id: agentId,
        encrypted_api_key:
          existing?.encrypted_api_key || encryptSecret("local"),
        base_url: resolvedBaseUrl,
      });
    } else if (apiKey) {
      await admin.from("agent_secrets").upsert({
        agent_id: agentId,
        encrypted_api_key: encryptSecret(apiKey),
        base_url: resolvedBaseUrl,
      });
    } else if (existing && baseUrl !== null) {
      await admin
        .from("agent_secrets")
        .update({ base_url: baseUrl })
        .eq("agent_id", agentId);
    }
  }

  if (agentId) {
    await supabase.from("agent_channels").delete().eq("agent_id", agentId);
    if (channelIds.length) {
      await supabase.from("agent_channels").insert(
        channelIds.map((channel_id) => ({ agent_id: agentId!, channel_id })),
      );
    }

    await supabase
      .from("agent_default_connectors")
      .delete()
      .eq("agent_id", agentId);
    if (connectorIds.length) {
      await supabase.from("agent_default_connectors").insert(
        connectorIds.map((community_connector_id) => ({
          agent_id: agentId!,
          community_connector_id,
        })),
      );
    }

    await supabase.from("agent_default_skills").delete().eq("agent_id", agentId);
    if (skillIds.length) {
      await supabase.from("agent_default_skills").insert(
        skillIds.map((skill_id) => ({ agent_id: agentId!, skill_id })),
      );
    }

    await supabase
      .from("agent_handoff_targets")
      .delete()
      .eq("agent_id", agentId);
    const uniqueHandoffTargets = [
      ...new Set(handoffTargetIds.filter((tid) => tid && tid !== agentId)),
    ];
    if (handoffEnabled && uniqueHandoffTargets.length) {
      await supabase.from("agent_handoff_targets").insert(
        uniqueHandoffTargets.map((target_agent_id) => ({
          agent_id: agentId!,
          target_agent_id,
        })),
      );
    }
  }

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  if (community?.slug) {
    revalidatePath(`/c/${community.slug}`, "layout");
  }
  redirect(`/c/${community?.slug}/settings/agents`);
}

export async function linkAgentsHandoffAction(input: {
  communityId: string;
  agentAId: string;
  agentBId: string;
  direction: "a_to_b" | "b_to_a" | "both";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { communityId, agentAId, agentBId, direction } = input;
  if (!communityId || !agentAId || !agentBId) {
    return { error: "Pick two agents to link" };
  }
  if (agentAId === agentBId) {
    return { error: "Choose two different agents" };
  }
  if (!["a_to_b", "b_to_a", "both"].includes(direction)) {
    return { error: "Invalid hand off direction" };
  }

  const { data: membership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return { error: "Only admins can link agents" };
  }

  const { data: agents, error: agentsError } = await supabase
    .from("agents")
    .select("id, name, kind, community_id")
    .eq("community_id", communityId)
    .in("id", [agentAId, agentBId]);
  if (agentsError) return { error: agentsError.message };
  if (!agents || agents.length !== 2) {
    return { error: "Both agents must belong to this community" };
  }

  const byId = new Map(agents.map((a) => [a.id, a]));
  const agentA = byId.get(agentAId);
  const agentB = byId.get(agentBId);
  if (!agentA || !agentB) return { error: "Agent not found" };
  if (agentA.kind !== "text" || agentB.kind !== "text") {
    return { error: "Hand off only works between text agents" };
  }

  const edges: Array<{ from: string; to: string }> = [];
  if (direction === "a_to_b" || direction === "both") {
    edges.push({ from: agentAId, to: agentBId });
  }
  if (direction === "b_to_a" || direction === "both") {
    edges.push({ from: agentBId, to: agentAId });
  }

  for (const edge of edges) {
    const { error: enableError } = await supabase
      .from("agents")
      .update({ handoff_enabled: true })
      .eq("id", edge.from)
      .eq("community_id", communityId);
    if (enableError) return { error: enableError.message };

    const { data: existing } = await supabase
      .from("agent_handoff_targets")
      .select("agent_id")
      .eq("agent_id", edge.from)
      .eq("target_agent_id", edge.to)
      .maybeSingle();

    if (!existing) {
      const { error: linkError } = await supabase
        .from("agent_handoff_targets")
        .insert({
          agent_id: edge.from,
          target_agent_id: edge.to,
        });
      if (linkError) return { error: linkError.message };
    }
  }

  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .single();
  if (community?.slug) {
    revalidatePath(`/c/${community.slug}/settings/agents`);
    revalidatePath(`/c/${community.slug}`, "layout");
  }

  return { ok: true as const };
}

function defaultModel(provider: string, kind: string) {
  if (kind === "video") {
    if (provider === "higgsfield") return "higgsfield-ai/dop/standard";
    return "sora-2";
  }
  if (kind === "image") {
    if (provider === "google") return "gemini-2.0-flash-preview-image-generation";
    if (provider === "higgsfield") return "gpt-image-2";
    return "dall-e-3";
  }
  switch (provider) {
    case "local":
      return "qwen2.5-1.5b-instruct";
    case "anthropic":
      return "claude-sonnet-4-5";
    case "google":
      return "gemini-2.0-flash";
    case "xai":
      return "grok-3";
    case "openrouter":
      return "moonshotai/kimi-k2";
    default:
      return "gpt-4o-mini";
  }
}
