"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { memberProfilePath } from "@/lib/profile-paths";
import type { CommunityRole } from "@/lib/types";

export type CommunityMemberListItem = {
  user_id: string;
  role: CommunityRole;
  joined_at: string;
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
};

function roleLabel(role: CommunityRole) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

function OwnerCrown() {
  return (
    <svg
      className="members-panel__crown"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label="Owner"
      role="img"
    >
      <path d="M2.2 11.2 3.1 5.4l2.7 2.3L8 3.6l2.2 4.1 2.7-2.3.9 5.8H2.2Z" />
      <path d="M2.4 12.4h11.2v1.3H2.4z" />
    </svg>
  );
}

export function CommunityMembersPanel({
  communityId,
  communitySlug,
  members,
  currentUserId,
  currentRole,
  updateRoleAction,
  removeMemberAction,
}: {
  communityId: string;
  communitySlug: string;
  members: CommunityMemberListItem[];
  currentUserId: string;
  currentRole: CommunityRole;
  updateRoleAction: (formData: FormData) => Promise<{ error?: string } | void>;
  removeMemberAction: (formData: FormData) => Promise<{ error?: string } | void>;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canManage = currentRole === "owner" || currentRole === "admin";
  const ownerCount = members.filter((m) => m.role === "owner").length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      m.profile.display_name.toLowerCase().includes(q),
    );
  }, [members, query]);

  function run(
    action: (formData: FormData) => Promise<{ error?: string } | void>,
    fd: FormData,
  ) {
    start(async () => {
      const res = await action(fd);
      if (res && "error" in res && res.error) setError(res.error);
      else setError(null);
    });
  }

  function canChangeRole(target: CommunityMemberListItem) {
    if (currentRole !== "owner") return false;
    if (
      target.role === "owner" &&
      ownerCount <= 1 &&
      target.user_id === currentUserId
    ) {
      return false;
    }
    return true;
  }

  function canRemove(target: CommunityMemberListItem) {
    if (target.user_id === currentUserId) {
      if (target.role === "owner" && ownerCount <= 1) return false;
      return true;
    }
    if (!canManage) return false;
    if (currentRole === "admin") return target.role === "member";
    if (target.role === "owner" && ownerCount <= 1) return false;
    return true;
  }

  return (
    <section className="members-panel panel rounded-2xl">
      <div className="members-panel__header">
        <h2 className="members-panel__count">
          Members <span>{members.length}</span>
        </h2>
      </div>

      <label className="members-panel__search">
        <span className="sr-only">Search members</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.25" />
          <path d="m16 16 3.5 3.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members"
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className="members-panel__error" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <ul className="members-panel__list">
        {filtered.length === 0 ? (
          <li className="members-panel__empty muted">No members match your search.</li>
        ) : (
          filtered.map((m) => {
            const isSelf = m.user_id === currentUserId;
            const editable = canChangeRole(m);
            const removable = canRemove(m);
            const joined = format(new Date(m.joined_at), "MMM d, yyyy");
            const meta = [
              roleLabel(m.role),
              `Added ${joined}`,
              isSelf ? "You" : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <li key={m.user_id} className="members-panel__row">
                <Link
                  href={memberProfilePath(communitySlug, m.user_id)}
                  className="members-panel__identity"
                >
                  <Avatar
                    src={m.profile.avatar_url}
                    name={m.profile.display_name}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="members-panel__name">
                      <span className="truncate">{m.profile.display_name}</span>
                      {m.role === "owner" ? <OwnerCrown /> : null}
                    </div>
                    <p className="members-panel__meta muted">{meta}</p>
                  </div>
                </Link>

                <div className="members-panel__actions">
                  {editable ? (
                    <select
                      className="field py-1.5 text-sm"
                      aria-label={`Role for ${m.profile.display_name}`}
                      defaultValue={m.role}
                      disabled={pending}
                      onChange={(e) => {
                        const fd = new FormData();
                        fd.set("community_id", communityId);
                        fd.set("user_id", m.user_id);
                        fd.set("role", e.target.value);
                        run(updateRoleAction, fd);
                      }}
                    >
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : null}

                  {removable ? (
                    <form action={(fd) => run(removeMemberAction, fd)}>
                      <input type="hidden" name="community_id" value={communityId} />
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <button
                        className="btn secondary compact"
                        type="submit"
                        disabled={pending}
                      >
                        {isSelf ? "Leave" : "Remove"}
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
