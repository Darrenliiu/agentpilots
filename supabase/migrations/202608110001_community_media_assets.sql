-- Durable catalog of agent-generated media for chat + Community Library.

create table if not exists public.community_media_assets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  channel_id uuid references public.channels (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('image', 'video')),
  mime text not null,
  storage_path text not null,
  public_url text not null,
  prompt text not null default '',
  provider text,
  model text,
  bytes integer,
  created_at timestamptz not null default now()
);

create index if not exists community_media_assets_community_created_idx
  on public.community_media_assets (community_id, created_at desc);

create index if not exists community_media_assets_agent_idx
  on public.community_media_assets (agent_id);

create index if not exists community_media_assets_message_idx
  on public.community_media_assets (message_id);

alter table public.community_media_assets enable row level security;

do $$ begin
  create policy "Members view community media assets"
    on public.community_media_assets for select to authenticated
    using (public.is_community_member(community_id));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "Admins delete community media assets"
    on public.community_media_assets for delete to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null;
end $$;
