-- Avatars for profiles (column already exists) and agents + public storage bucket

alter table public.agents
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "Public read avatars"
    on storage.objects for select
    using (bucket_id = 'avatars');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users upload own avatar"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users update own avatar"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    )
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Users delete own avatar"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] = auth.uid()::text
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins upload agent avatars"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'agents'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins update agent avatars"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'agents'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    )
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'agents'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Admins delete agent avatars"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = 'agents'
      and public.is_community_admin(((storage.foldername(name))[2])::uuid)
    );
exception when duplicate_object then null; end $$;
