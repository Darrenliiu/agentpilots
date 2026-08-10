-- Quote-replies (parent_id) + emoji reactions on messages

alter table public.messages
  add column if not exists parent_id uuid references public.messages (id) on delete set null;

create index if not exists messages_channel_parent_idx
  on public.messages (channel_id, parent_id);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  constraint message_reactions_emoji_len check (char_length(emoji) between 1 and 16),
  constraint message_reactions_unique unique (message_id, user_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

do $$ begin
  create policy "Channel members read reactions"
    on public.message_reactions for select to authenticated
    using (
      exists (
        select 1 from public.messages m
        where m.id = message_id and public.is_channel_member(m.channel_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Channel members insert own reactions"
    on public.message_reactions for insert to authenticated
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.messages m
        where m.id = message_id and public.is_channel_member(m.channel_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users delete own reactions"
    on public.message_reactions for delete to authenticated
    using (
      user_id = auth.uid()
      and exists (
        select 1 from public.messages m
        where m.id = message_id and public.is_channel_member(m.channel_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; end $$;

-- Ensure DELETE realtime payloads include row identity
alter table public.message_reactions replica identity full;
