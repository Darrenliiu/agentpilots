-- Discover: list all communities, preview members/agents, join public only

-- 1. All communities readable by authenticated users (for Discover)
do $$ begin
  create policy "Authenticated can view all communities"
    on public.communities for select to authenticated
    using (true);
exception when duplicate_object then null; end $$;

-- 2. Preview: any authenticated user can view membership rows (for Discover cards)
do $$ begin
  create policy "Authenticated can view membership for discover"
    on public.community_members for select to authenticated
    using (true);
exception when duplicate_object then null; end $$;

-- 2b. Preview: active agents visible to authenticated users
do $$ begin
  create policy "Authenticated can view active agents for discover"
    on public.agents for select to authenticated
    using (status = 'active');
exception when duplicate_object then null; end $$;

-- 3. Secure public join (security definer — bypasses tightened insert policy)
create or replace function public.join_public_community(p_community_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  vis text;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select visibility into vis from public.communities where id = p_community_id;
  if not found then raise exception 'Community not found'; end if;
  if vis <> 'public' then raise exception 'Community is private — invite required'; end if;

  insert into public.community_members (community_id, user_id, role)
  values (p_community_id, uid, 'member')
  on conflict do nothing;

  insert into public.channel_members (channel_id, user_id)
  select c.id, uid from public.channels c
  where c.community_id = p_community_id and c.type = 'public'
  on conflict do nothing;

  return p_community_id;
end;
$$;

revoke all on function public.join_public_community(uuid) from public;
grant execute on function public.join_public_community(uuid) to authenticated;

-- 4. Tighten self-join: non-admins may only insert themselves into public communities
drop policy if exists "Users can insert self as owner on create" on public.community_members;

do $$ begin
  create policy "Users can insert self as owner on create"
    on public.community_members for insert to authenticated
    with check (
      public.is_community_admin(community_id)
      or (
        user_id = auth.uid()
        and role = 'member'
        and exists (
          select 1 from public.communities c
          where c.id = community_id and c.visibility = 'public'
        )
      )
    );
exception when duplicate_object then null; end $$;
