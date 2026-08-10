-- AgentPilots complete schema
create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_by uuid not null references public.profiles (id) on delete cascade,
  email text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  slug text not null,
  type text not null check (type in ('public', 'private', 'dm')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, slug)
);

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  slug text not null,
  system_prompt text not null default '',
  kind text not null check (kind in ('text', 'image', 'video')),
  provider text not null,
  model text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  avatar_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, slug)
);

create table if not exists public.agent_secrets (
  agent_id uuid primary key references public.agents (id) on delete cascade,
  encrypted_api_key text not null,
  base_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_channels (
  agent_id uuid not null references public.agents (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, channel_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  agent_id uuid references public.agents (id) on delete set null,
  body text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  client_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_author_check check (author_id is not null or agent_id is not null)
);

create index if not exists messages_channel_created_idx on public.messages (channel_id, created_at);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed')),
  error text,
  result_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_community_member(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_community_admin(p_community_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channels c
    left join public.channel_members cm on cm.channel_id = c.id and cm.user_id = auth.uid()
    where c.id = p_channel_id and (
      (c.type = 'public' and public.is_community_member(c.community_id)) or cm.user_id is not null
    )
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'Pilot'));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists communities_updated_at on public.communities;
create trigger communities_updated_at before update on public.communities for each row execute function public.set_updated_at();
drop trigger if exists channels_updated_at on public.channels;
create trigger channels_updated_at before update on public.channels for each row execute function public.set_updated_at();
drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at before update on public.agents for each row execute function public.set_updated_at();
drop trigger if exists messages_updated_at on public.messages;
create trigger messages_updated_at before update on public.messages for each row execute function public.set_updated_at();
drop trigger if exists agent_secrets_updated_at on public.agent_secrets;
create trigger agent_secrets_updated_at before update on public.agent_secrets for each row execute function public.set_updated_at();
drop trigger if exists agent_runs_updated_at on public.agent_runs;
create trigger agent_runs_updated_at before update on public.agent_runs for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.invites enable row level security;
alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.agents enable row level security;
alter table public.agent_secrets enable row level security;
alter table public.agent_channels enable row level security;
alter table public.messages enable row level security;
alter table public.agent_runs enable row level security;

do $$ begin
  create policy "Profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users update own profile" on public.profiles for update to authenticated using (id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members can view communities" on public.communities for select to authenticated using (public.is_community_member(id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated can create communities" on public.communities for insert to authenticated with check (created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins can update communities" on public.communities for update to authenticated using (public.is_community_admin(id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members can view membership" on public.community_members for select to authenticated using (public.is_community_member(community_id) or user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users can insert self as owner on create" on public.community_members for insert to authenticated with check (user_id = auth.uid() or public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins can update membership" on public.community_members for update to authenticated using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins or self can leave" on public.community_members for delete to authenticated using (user_id = auth.uid() or public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members can view invites" on public.invites for select to authenticated using (public.is_community_member(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins create invites" on public.invites for insert to authenticated with check (public.is_community_admin(community_id) and created_by = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins update invites" on public.invites for update to authenticated using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Channel access" on public.channels for select to authenticated using ((type = 'public' and public.is_community_member(community_id)) or public.is_channel_member(id) or public.is_community_member(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members create channels" on public.channels for insert to authenticated with check (public.is_community_member(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins update channels" on public.channels for update to authenticated using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "View channel members if can access channel" on public.channel_members for select to authenticated using (public.is_channel_member(channel_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins manage channel members" on public.channel_members for insert to authenticated with check (public.is_community_admin((select community_id from public.channels where id = channel_id)) or user_id = auth.uid());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Leave or admin remove channel member" on public.channel_members for delete to authenticated using (user_id = auth.uid() or public.is_community_admin((select community_id from public.channels where id = channel_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members view agents" on public.agents for select to authenticated using (public.is_community_member(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins manage agents insert" on public.agents for insert to authenticated with check (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins manage agents update" on public.agents for update to authenticated using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins manage agents delete" on public.agents for delete to authenticated using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members view agent channels" on public.agent_channels for select to authenticated using (exists (select 1 from public.agents a where a.id = agent_id and public.is_community_member(a.community_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins manage agent channels" on public.agent_channels for insert to authenticated with check (exists (select 1 from public.agents a where a.id = agent_id and public.is_community_admin(a.community_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins delete agent channels" on public.agent_channels for delete to authenticated using (exists (select 1 from public.agents a where a.id = agent_id and public.is_community_admin(a.community_id)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Channel members read messages" on public.messages for select to authenticated using (public.is_channel_member(channel_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Channel members insert messages" on public.messages for insert to authenticated with check (public.is_channel_member(channel_id) and author_id = auth.uid() and agent_id is null);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Members view agent runs" on public.agent_runs for select to authenticated using (exists (select 1 from public.messages m where m.id = message_id and public.is_channel_member(m.channel_id)));
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public) values ('agent-media', 'agent-media', true) on conflict (id) do nothing;
do $$ begin
  create policy "Public read agent media" on storage.objects for select using (bucket_id = 'agent-media');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Authenticated upload agent media" on storage.objects for insert to authenticated with check (bucket_id = 'agent-media');
exception when duplicate_object then null; end $$;

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do update set public = true;
do $$ begin
  create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Users delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'users' and (storage.foldername(name))[2] = auth.uid()::text);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins upload agent avatars" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'agents' and public.is_community_admin(((storage.foldername(name))[2])::uuid));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins update agent avatars" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'agents' and public.is_community_admin(((storage.foldername(name))[2])::uuid))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'agents' and public.is_community_admin(((storage.foldername(name))[2])::uuid));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "Admins delete agent avatars" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = 'agents' and public.is_community_admin(((storage.foldername(name))[2])::uuid));
exception when duplicate_object then null; end $$;

create or replace function public.slugify(input text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.create_community(p_name text)
returns public.communities
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  base_slug text;
  final_slug text;
  n int := 0;
  comm public.communities;
  general_id uuid;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  base_slug := public.slugify(p_name);
  if base_slug = '' then base_slug := 'community'; end if;
  final_slug := base_slug;
  while exists (select 1 from public.communities where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n::text;
  end loop;
  insert into public.communities (name, slug, created_by)
  values (p_name, final_slug, uid) returning * into comm;
  insert into public.community_members (community_id, user_id, role) values (comm.id, uid, 'owner');
  insert into public.channels (community_id, name, slug, type, created_by)
  values (comm.id, 'general', 'general', 'public', uid) returning id into general_id;
  insert into public.channel_members (channel_id, user_id) values (general_id, uid);
  return comm;
end;
$$;

revoke all on function public.create_community(text) from public;
grant execute on function public.create_community(text) to authenticated;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into inv from public.invites
  where token = p_token and accepted_by is null and expires_at > now() for update;
  if not found then raise exception 'Invalid or expired invite'; end if;
  if inv.email is not null then
    if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email', '')) then
      raise exception 'Invite email mismatch';
    end if;
  end if;
  insert into public.community_members (community_id, user_id, role)
  values (inv.community_id, uid, 'member') on conflict do nothing;
  insert into public.channel_members (channel_id, user_id)
  select c.id, uid from public.channels c
  where c.community_id = inv.community_id and c.type in ('public')
  on conflict do nothing;
  update public.invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  return inv.community_id;
end;
$$;

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.get_invite_preview(p_token text)
returns table (community_name text, community_slug text, expires_at timestamptz, email text)
language sql security definer set search_path = public as $$
  select c.name, c.slug, i.expires_at, i.email
  from public.invites i
  join public.communities c on c.id = i.community_id
  where i.token = p_token and i.accepted_by is null and i.expires_at > now();
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
