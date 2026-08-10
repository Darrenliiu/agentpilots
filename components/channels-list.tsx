import Link from "next/link";
import { AvatarStack, type AvatarStackItem } from "@/components/avatar-stack";

export type ChannelListItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  members: AvatarStackItem[];
  agents: AvatarStackItem[];
};

export function ChannelsList({
  channels,
  communitySlug,
}: {
  channels: ChannelListItem[];
  communitySlug: string;
}) {
  if (channels.length === 0) {
    return (
      <div className="panel rounded-2xl px-5 py-10 text-center">
        <p className="brand text-xl">No channels yet</p>
        <p className="muted mx-auto mt-2 max-w-sm text-sm">
          Create a public or private channel below to get started.
        </p>
      </div>
    );
  }

  return (
    <ul className="panel overflow-hidden rounded-2xl">
      {channels.map((channel, index) => (
        <li
          key={channel.id}
          style={
            index > 0 ? { borderTop: "1px solid var(--line)" } : undefined
          }
        >
          <Link
            href={`/c/${communitySlug}/${channel.slug}`}
            className="nav-hover flex items-center gap-3 px-4 py-3 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold"># {channel.name}</div>
              <div className="muted truncate text-sm capitalize">
                {channel.type}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="flex flex-col items-end gap-0.5">
                <span className="muted text-[10px] font-semibold uppercase tracking-[0.1em]">
                  Members
                </span>
                <AvatarStack items={channel.members} label="members" />
              </div>
              {channel.agents.length > 0 ? (
                <div className="flex flex-col items-end gap-0.5">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                    style={{ color: "var(--agent)" }}
                  >
                    Agents
                  </span>
                  <AvatarStack items={channel.agents} label="agents" />
                </div>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
