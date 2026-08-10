-- Agent Hand Off: columns + allowlist targets

alter table public.agents
  add column if not exists handoff_enabled boolean not null default false;

alter table public.agents
  add column if not exists handoff_max_depth int null;

alter table public.agents
  add column if not exists handoff_block_cycles boolean not null default true;

alter table public.agents
  add column if not exists handoff_prompt_assist boolean not null default true;

do $$ begin
  alter table public.agents
    add constraint agents_handoff_max_depth_check
    check (handoff_max_depth is null or handoff_max_depth >= 1);
exception when duplicate_object then null; end $$;

create table if not exists public.agent_handoff_targets (
  agent_id uuid not null references public.agents (id) on delete cascade,
  target_agent_id uuid not null references public.agents (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, target_agent_id),
  constraint agent_handoff_targets_no_self check (agent_id <> target_agent_id)
);

create index if not exists agent_handoff_targets_target_idx
  on public.agent_handoff_targets (target_agent_id);

alter table public.agent_handoff_targets enable row level security;

do $$ begin
  create policy "Members view agent handoff targets"
    on public.agent_handoff_targets for select to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_member(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent handoff targets insert"
    on public.agent_handoff_targets for insert to authenticated
    with check (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
      and exists (
        select 1 from public.agents src
        join public.agents tgt on tgt.id = target_agent_id
        where src.id = agent_id and tgt.community_id = src.community_id
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent handoff targets delete"
    on public.agent_handoff_targets for delete to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;
