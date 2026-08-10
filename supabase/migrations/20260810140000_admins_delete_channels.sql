-- Allow community owners/admins to delete channels (update policy already exists).
do $$ begin
  create policy "Admins delete channels" on public.channels
    for delete to authenticated
    using (public.is_community_admin(community_id));
exception when duplicate_object then null;
end $$;
