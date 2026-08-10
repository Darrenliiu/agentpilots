-- Enable realtime for sidebar channels + DM membership updates
do $$ begin
  alter publication supabase_realtime add table public.channels;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.channel_members;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.agent_channels;
exception when duplicate_object then null; end $$;
