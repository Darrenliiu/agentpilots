-- Connectors (MCP) + Skills for communities

create table if not exists public.connector_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  icon text,
  mcp_url text not null,
  auth_type text not null check (auth_type in ('oauth', 'bearer', 'none')),
  docs_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.community_connectors (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  catalog_id uuid references public.connector_catalog (id) on delete set null,
  name text not null,
  slug text not null,
  mcp_url text not null,
  auth_type text not null check (auth_type in ('oauth', 'bearer', 'none')),
  enabled boolean not null default true,
  allow_shared_secret boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, slug)
);

create table if not exists public.user_connector_accounts (
  id uuid primary key default gen_random_uuid(),
  community_connector_id uuid not null references public.community_connectors (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  is_shared boolean not null default false,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connector_accounts_owner_check check (
    (is_shared = true and user_id is null) or (is_shared = false and user_id is not null)
  )
);

-- One personal account per user per connector; one shared account per connector
create unique index if not exists user_connector_accounts_personal_uidx
  on public.user_connector_accounts (community_connector_id, user_id)
  where is_shared = false and user_id is not null;

create unique index if not exists user_connector_accounts_shared_uidx
  on public.user_connector_accounts (community_connector_id)
  where is_shared = true;

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities (id) on delete cascade,
  name text not null,
  description text not null default '',
  body text not null,
  source_url text not null,
  source_registry text,
  source_id text,
  enabled boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists skills_community_idx on public.skills (community_id);

create table if not exists public.agent_default_connectors (
  agent_id uuid not null references public.agents (id) on delete cascade,
  community_connector_id uuid not null references public.community_connectors (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, community_connector_id)
);

create table if not exists public.agent_default_skills (
  agent_id uuid not null references public.agents (id) on delete cascade,
  skill_id uuid not null references public.skills (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, skill_id)
);

drop trigger if exists community_connectors_updated_at on public.community_connectors;
create trigger community_connectors_updated_at
  before update on public.community_connectors
  for each row execute function public.set_updated_at();

drop trigger if exists user_connector_accounts_updated_at on public.user_connector_accounts;
create trigger user_connector_accounts_updated_at
  before update on public.user_connector_accounts
  for each row execute function public.set_updated_at();

drop trigger if exists skills_updated_at on public.skills;
create trigger skills_updated_at
  before update on public.skills
  for each row execute function public.set_updated_at();

alter table public.connector_catalog enable row level security;
alter table public.community_connectors enable row level security;
alter table public.user_connector_accounts enable row level security;
alter table public.skills enable row level security;
alter table public.agent_default_connectors enable row level security;
alter table public.agent_default_skills enable row level security;

do $$ begin
  create policy "Authenticated read connector catalog"
    on public.connector_catalog for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members view community connectors"
    on public.community_connectors for select to authenticated
    using (public.is_community_member(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins insert community connectors"
    on public.community_connectors for insert to authenticated
    with check (public.is_community_admin(community_id) and created_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins update community connectors"
    on public.community_connectors for update to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins delete community connectors"
    on public.community_connectors for delete to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members view connector accounts"
    on public.user_connector_accounts for select to authenticated
    using (
      exists (
        select 1 from public.community_connectors cc
        where cc.id = community_connector_id
          and public.is_community_member(cc.community_id)
      )
      and (is_shared = true or user_id = auth.uid() or public.is_community_admin(
        (select community_id from public.community_connectors where id = community_connector_id)
      ))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users insert own connector accounts"
    on public.user_connector_accounts for insert to authenticated
    with check (
      exists (
        select 1 from public.community_connectors cc
        where cc.id = community_connector_id
          and public.is_community_member(cc.community_id)
      )
      and (
        (is_shared = false and user_id = auth.uid())
        or (
          is_shared = true
          and user_id is null
          and public.is_community_admin(
            (select community_id from public.community_connectors where id = community_connector_id)
          )
        )
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users update own connector accounts"
    on public.user_connector_accounts for update to authenticated
    using (
      (is_shared = false and user_id = auth.uid())
      or (
        is_shared = true
        and public.is_community_admin(
          (select community_id from public.community_connectors where id = community_connector_id)
        )
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users delete own connector accounts"
    on public.user_connector_accounts for delete to authenticated
    using (
      (is_shared = false and user_id = auth.uid())
      or (
        is_shared = true
        and public.is_community_admin(
          (select community_id from public.community_connectors where id = community_connector_id)
        )
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members view skills"
    on public.skills for select to authenticated
    using (public.is_community_member(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins insert skills"
    on public.skills for insert to authenticated
    with check (public.is_community_admin(community_id) and created_by = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins update skills"
    on public.skills for update to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins delete skills"
    on public.skills for delete to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members view agent default connectors"
    on public.agent_default_connectors for select to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_member(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent default connectors insert"
    on public.agent_default_connectors for insert to authenticated
    with check (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent default connectors delete"
    on public.agent_default_connectors for delete to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members view agent default skills"
    on public.agent_default_skills for select to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_member(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent default skills insert"
    on public.agent_default_skills for insert to authenticated
    with check (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins manage agent default skills delete"
    on public.agent_default_skills for delete to authenticated
    using (
      exists (
        select 1 from public.agents a
        where a.id = agent_id and public.is_community_admin(a.community_id)
      )
    );
exception when duplicate_object then null; end $$;

-- Seed curated remote MCP apps
insert into public.connector_catalog (slug, name, description, icon, mcp_url, auth_type, docs_url)
values
  (
    'notion',
    'Notion',
    'Read and write Notion pages and databases via Notion MCP.',
    'notion',
    'https://mcp.notion.com/mcp',
    'oauth',
    'https://developers.notion.com/docs/mcp'
  ),
  (
    'linear',
    'Linear',
    'Manage Linear issues and projects via Linear MCP.',
    'linear',
    'https://mcp.linear.app/mcp',
    'oauth',
    'https://linear.app/docs/mcp'
  ),
  (
    'github',
    'GitHub',
    'Work with GitHub repositories, issues, and pull requests.',
    'github',
    'https://api.githubcopilot.com/mcp/',
    'oauth',
    'https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server'
  ),
  (
    'figma',
    'Figma',
    'Access Figma design files and context via Figma MCP.',
    'figma',
    'https://mcp.figma.com/mcp',
    'oauth',
    'https://www.figma.com/mcp-catalog/'
  ),
  (
    'context7',
    'Context7',
    'Look up up-to-date library documentation.',
    'context7',
    'https://mcp.context7.com/mcp',
    'none',
    'https://context7.com/'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  mcp_url = excluded.mcp_url,
  auth_type = excluded.auth_type,
  docs_url = excluded.docs_url;
