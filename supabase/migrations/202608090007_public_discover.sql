-- Allow anonymous users to browse Discover (read-only)

do $$ begin
  create policy "Anyone can view discoverable communities"
    on public.communities for select to anon
    using (discoverable = true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view membership for discoverable communities"
    on public.community_members for select to anon
    using (
      exists (
        select 1 from public.communities c
        where c.id = community_id and c.discoverable = true
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view active agents for discoverable communities"
    on public.agents for select to anon
    using (
      status = 'active'
      and exists (
        select 1 from public.communities c
        where c.id = community_id and c.discoverable = true
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Anyone can view profiles for discover"
    on public.profiles for select to anon
    using (true);
exception when duplicate_object then null; end $$;
