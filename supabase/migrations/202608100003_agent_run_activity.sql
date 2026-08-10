-- Agent run activity: denormalized channel/community + live progress for UI indicators

alter table public.agent_runs
  add column if not exists channel_id uuid references public.channels (id) on delete cascade,
  add column if not exists community_id uuid references public.communities (id) on delete cascade,
  add column if not exists phase text,
  add column if not exists status_text text;

do $$ begin
  alter table public.agent_runs
    add constraint agent_runs_phase_check
    check (
      phase is null
      or phase in (
        'thinking',
        'tool',
        'reasoning',
        'generating',
        'sending',
        'done',
        'failed'
      )
    );
exception when duplicate_object then null; end $$;

-- Backfill from messages + channels for any existing rows
update public.agent_runs ar
set
  channel_id = m.channel_id,
  community_id = c.community_id
from public.messages m
join public.channels c on c.id = m.channel_id
where ar.message_id = m.id
  and (ar.channel_id is null or ar.community_id is null);

create index if not exists agent_runs_community_status_idx
  on public.agent_runs (community_id, status)
  where status = 'running';

create index if not exists agent_runs_channel_status_idx
  on public.agent_runs (channel_id, status)
  where status = 'running';

do $$ begin
  alter publication supabase_realtime add table public.agent_runs;
exception when duplicate_object then null; end $$;
