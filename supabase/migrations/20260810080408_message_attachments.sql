-- Message attachment storage for chat prompt context (images, docs, PDFs)

insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', true)
on conflict (id) do update set public = true;

do $$ begin
  create policy "Public read message attachments"
    on storage.objects for select
    using (bucket_id = 'message-attachments');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members upload message attachments"
    on storage.objects for insert to authenticated
    with check (
      bucket_id = 'message-attachments'
      and public.is_community_member(((storage.foldername(name))[1])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members update own message attachments"
    on storage.objects for update to authenticated
    using (
      bucket_id = 'message-attachments'
      and public.is_community_member(((storage.foldername(name))[1])::uuid)
    )
    with check (
      bucket_id = 'message-attachments'
      and public.is_community_member(((storage.foldername(name))[1])::uuid)
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Members delete message attachments"
    on storage.objects for delete to authenticated
    using (
      bucket_id = 'message-attachments'
      and public.is_community_member(((storage.foldername(name))[1])::uuid)
    );
exception when duplicate_object then null; end $$;
