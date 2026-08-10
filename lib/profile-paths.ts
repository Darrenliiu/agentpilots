/** Community-scoped profile URLs for members and agents. */
export function memberProfilePath(communitySlug: string, userId: string) {
  return `/c/${communitySlug}/u/${userId}`;
}

export function agentProfilePath(communitySlug: string, agentId: string) {
  return `/c/${communitySlug}/a/${agentId}`;
}

export function profilePath(
  communitySlug: string,
  kind: "human" | "agent",
  id: string,
) {
  return kind === "agent"
    ? agentProfilePath(communitySlug, id)
    : memberProfilePath(communitySlug, id);
}
