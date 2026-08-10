-- Denormalize token usage onto agent_runs for community usage dashboards

alter table public.agent_runs
  add column if not exists input_tokens int,
  add column if not exists output_tokens int,
  add column if not exists total_tokens int;

create index if not exists agent_runs_community_created_idx
  on public.agent_runs (community_id, created_at desc);

-- Backfill from reply message metadata.usage
update public.agent_runs ar
set
  input_tokens = case
    when jsonb_typeof(m.metadata->'usage'->'inputTokens') = 'number'
      then (m.metadata->'usage'->>'inputTokens')::int
    else null
  end,
  output_tokens = case
    when jsonb_typeof(m.metadata->'usage'->'outputTokens') = 'number'
      then (m.metadata->'usage'->>'outputTokens')::int
    else null
  end,
  total_tokens = case
    when jsonb_typeof(m.metadata->'usage'->'totalTokens') = 'number'
      then (m.metadata->'usage'->>'totalTokens')::int
    when jsonb_typeof(m.metadata->'usage'->'inputTokens') = 'number'
      and jsonb_typeof(m.metadata->'usage'->'outputTokens') = 'number'
      then (m.metadata->'usage'->>'inputTokens')::int
        + (m.metadata->'usage'->>'outputTokens')::int
    else null
  end
from public.messages m
where ar.result_message_id = m.id
  and ar.total_tokens is null
  and m.metadata ? 'usage';

do $$ begin
  create policy "Admins view community agent runs"
    on public.agent_runs
    for select
    to authenticated
    using (
      community_id is not null
      and public.is_community_admin(community_id)
    );
exception when duplicate_object then null; end $$;
