-- Community Free / Pro billing: plan columns, seat & agent caps

alter table public.communities
  add column if not exists plan text not null default 'free';

alter table public.communities
  add column if not exists stripe_customer_id text;

alter table public.communities
  add column if not exists stripe_subscription_id text;

alter table public.communities
  add column if not exists stripe_subscription_status text;

alter table public.communities
  add column if not exists billing_interval text;

do $$ begin
  alter table public.communities
    add constraint communities_plan_check
    check (plan in ('free', 'pro'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.communities
    add constraint communities_billing_interval_check
    check (billing_interval is null or billing_interval in ('month', 'year'));
exception when duplicate_object then null; end $$;

create unique index if not exists communities_stripe_customer_id_uidx
  on public.communities (stripe_customer_id)
  where stripe_customer_id is not null;

create unique index if not exists communities_stripe_subscription_id_uidx
  on public.communities (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Prevent clients from forging plan / Stripe fields (service_role only)
create or replace function public.protect_community_billing_columns()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  new.plan := old.plan;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.stripe_subscription_status := old.stripe_subscription_status;
  new.billing_interval := old.billing_interval;
  return new;
end;
$$;

drop trigger if exists communities_protect_billing on public.communities;
create trigger communities_protect_billing
  before update on public.communities
  for each row execute function public.protect_community_billing_columns();

create or replace function public.community_seat_count(p_community_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.community_members
  where community_id = p_community_id;
$$;

create or replace function public.community_agent_count(p_community_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.agents
  where community_id = p_community_id;
$$;

create or replace function public.assert_can_add_community_seat(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c_plan text;
  seats integer;
begin
  select plan into c_plan from public.communities where id = p_community_id;
  if not found then raise exception 'Community not found'; end if;
  if c_plan <> 'free' then return; end if;
  seats := public.community_seat_count(p_community_id);
  if seats >= 10 then
    raise exception 'Free communities are limited to 10 members. Upgrade to Pro for unlimited seats.';
  end if;
end;
$$;

create or replace function public.join_public_community(p_community_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  vis text;
  already boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select visibility into vis from public.communities where id = p_community_id;
  if not found then raise exception 'Community not found'; end if;
  if vis <> 'public' then raise exception 'Community is private — invite required'; end if;

  select exists (
    select 1 from public.community_members
    where community_id = p_community_id and user_id = uid
  ) into already;

  if not already then
    perform public.assert_can_add_community_seat(p_community_id);
  end if;

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

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  uid uuid := auth.uid();
  already boolean;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select * into inv from public.invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (
      is_reusable = true
      or accepted_by is null
    )
  for update;
  if not found then raise exception 'Invalid or expired invite'; end if;
  if inv.email is not null then
    if lower(inv.email) <> lower(coalesce(auth.jwt()->>'email', '')) then
      raise exception 'Invite email mismatch';
    end if;
  end if;

  select exists (
    select 1 from public.community_members
    where community_id = inv.community_id and user_id = uid
  ) into already;

  if not already then
    perform public.assert_can_add_community_seat(inv.community_id);
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (inv.community_id, uid, 'member') on conflict do nothing;
  insert into public.channel_members (channel_id, user_id)
  select c.id, uid from public.channels c
  where c.community_id = inv.community_id and c.type in ('public')
  on conflict do nothing;
  if inv.is_reusable = false then
    update public.invites set accepted_by = uid, accepted_at = now() where id = inv.id;
  end if;
  return inv.community_id;
end;
$$;

create or replace function public.enforce_free_agent_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_plan text;
  cnt integer;
begin
  select plan into c_plan from public.communities where id = new.community_id;
  if c_plan = 'free' then
    select count(*)::integer into cnt
    from public.agents
    where community_id = new.community_id;
    if cnt >= 5 then
      raise exception 'Free communities are limited to 5 agents. Upgrade to Pro for unlimited agents.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agents_enforce_free_limit on public.agents;
create trigger agents_enforce_free_limit
  before insert on public.agents
  for each row execute function public.enforce_free_agent_limit();
