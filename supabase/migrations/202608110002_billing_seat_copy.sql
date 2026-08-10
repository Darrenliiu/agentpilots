-- Soften Free seat-cap upgrade copy (Pro includes 25 seats + paid extras).
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
    raise exception 'Free communities are limited to 10 members. Upgrade to Pro for more seats.';
  end if;
end;
$$;
