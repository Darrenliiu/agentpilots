-- Community color themes (preset ids only)

alter table public.communities
  add column if not exists theme text not null default 'default';

do $$ begin
  alter table public.communities
    add constraint communities_theme_check
    check (
      theme in (
        'default',
        'midnight',
        'slate',
        'ocean',
        'forest',
        'sand',
        'sunset',
        'ink-paper',
        'blush',
        'aurora'
      )
    );
exception when duplicate_object then null; end $$;
