-- Reusable community share invite links (multi-join until expiry / revoke)

alter table public.invites
  add column if not exists is_reusable boolean not null default false;

alter table public.invites
  alter column expires_at drop not null;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites%rowtype;
  uid uuid := auth.uid();
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

revoke all on function public.accept_invite(text) from public;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.get_invite_preview(p_token text)
returns table (community_name text, community_slug text, expires_at timestamptz, email text)
language sql security definer set search_path = public as $$
  select c.name, c.slug, i.expires_at, i.email
  from public.invites i
  join public.communities c on c.id = i.community_id
  where i.token = p_token
    and (i.expires_at is null or i.expires_at > now())
    and (
      i.is_reusable = true
      or i.accepted_by is null
    );
$$;

revoke all on function public.get_invite_preview(text) from public;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
