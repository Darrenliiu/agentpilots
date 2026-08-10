-- Separate discoverability from public/private join rules

alter table public.communities
  add column if not exists discoverable boolean not null default false;

-- Existing public communities were labeled "discoverable" — keep them listed
update public.communities
set discoverable = true
where visibility = 'public' and discoverable = false;

-- Replace blanket "view all" with discoverable-only for non-members
drop policy if exists "Authenticated can view all communities" on public.communities;

do $$ begin
  create policy "Authenticated can view discoverable communities"
    on public.communities for select to authenticated
    using (discoverable = true);
exception when duplicate_object then null; end $$;
