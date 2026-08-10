-- Enable realtime for sidebar agent + member lists
do $$ begin
  alter publication supabase_realtime add table public.agents;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.community_members;
exception when duplicate_object then null; end $$;
