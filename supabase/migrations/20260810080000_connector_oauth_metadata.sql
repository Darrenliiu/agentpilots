-- Persist OAuth client metadata so refresh_token grants can reuse the same client.
alter table public.user_connector_accounts
  add column if not exists oauth_client_id text,
  add column if not exists encrypted_oauth_client_secret text,
  add column if not exists oauth_token_endpoint text,
  add column if not exists oauth_resource text;
