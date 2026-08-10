-- Community settings: description, avatar, visibility + storage policies

alter table public.communities
  add column if not exists description text not null default '';

alter table public.communities
  add column if not exists avatar_url text;

alter table public.communities
  add column if not exists visibility text not null default 'private';

do $$ begin
  alter table public.communities
    add constraint communities_visibility_check
    check (visibility in ('public', 'private'));
exception when duplicate_object then null; end $$;

-- Public communities readable by any authenticated user (members already covered)
do $$ begin
  create policy "Public communities are viewable"
    on public.communities for select to authenticated
    using (visibility = 'public');
exception when duplicate_object then null; end $$;

-- Community avatar storage: communities/{communityId}/...
do $$ begin
  create policy "Admins upload community avatars"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'communities'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins update community avatars"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'communities'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    )
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'communities'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins delete community avatars"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'communities'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;
