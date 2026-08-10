-- Expand curated remote MCP connector catalog with popular apps

insert into public.connector_catalog (slug, name, description, icon, mcp_url, auth_type, docs_url)
values
  (
    'vercel',
    'Vercel',
    'Deployments, projects, logs, and environment variables via Vercel MCP.',
    'vercel',
    'https://mcp.vercel.com',
    'oauth',
    'https://vercel.com/docs/agent-resources/vercel-mcp'
  ),
  (
    'supabase',
    'Supabase',
    'Query databases, manage auth, storage, and Edge Functions via Supabase MCP.',
    'supabase',
    'https://mcp.supabase.com/mcp',
    'oauth',
    'https://supabase.com/docs/guides/ai-tools/mcp'
  ),
  (
    'google-drive',
    'Google Drive',
    'Search and read Google Drive files via Google Drive MCP.',
    'googledrive',
    'https://drivemcp.googleapis.com/mcp/v1',
    'oauth',
    'https://docs.cloud.google.com/mcp/supported-products'
  ),
  (
    'gmail',
    'Gmail',
    'Read and manage Gmail messages via Gmail MCP.',
    'gmail',
    'https://gmailmcp.googleapis.com/mcp/v1',
    'oauth',
    'https://docs.cloud.google.com/mcp/supported-products'
  ),
  (
    'google-calendar',
    'Google Calendar',
    'View and manage calendar events via Google Calendar MCP.',
    'googlecalendar',
    'https://calendarmcp.googleapis.com/mcp/v1',
    'oauth',
    'https://docs.cloud.google.com/mcp/supported-products'
  ),
  (
    'google-chat',
    'Google Chat',
    'Work with Google Chat spaces and messages via Google Chat MCP.',
    'googlechat',
    'https://chatmcp.googleapis.com/mcp/v1',
    'oauth',
    'https://docs.cloud.google.com/mcp/supported-products'
  ),
  (
    'slack',
    'Slack',
    'Search channels and messages via Slack MCP.',
    'slack',
    'https://mcp.slack.com/mcp',
    'oauth',
    'https://docs.slack.dev/ai/mcp-server'
  ),
  (
    'stripe',
    'Stripe',
    'Customers, payments, subscriptions, and invoices via Stripe MCP.',
    'stripe',
    'https://mcp.stripe.com',
    'oauth',
    'https://docs.stripe.com/mcp'
  ),
  (
    'sentry',
    'Sentry',
    'Error tracking, issues, and performance via Sentry MCP.',
    'sentry',
    'https://mcp.sentry.dev/mcp',
    'oauth',
    'https://docs.sentry.io/product/sentry-mcp/'
  ),
  (
    'atlassian',
    'Atlassian',
    'Jira issues and Confluence pages via Atlassian remote MCP.',
    'atlassian',
    'https://mcp.atlassian.com/v1/mcp',
    'oauth',
    'https://www.atlassian.com/platform/remote-mcp-server'
  ),
  (
    'hubspot',
    'HubSpot',
    'CRM contacts, deals, and pipelines via HubSpot MCP.',
    'hubspot',
    'https://mcp.hubspot.com',
    'oauth',
    'https://developers.hubspot.com/docs/guides/mcp'
  ),
  (
    'neon',
    'Neon',
    'Serverless Postgres, branching, and migrations via Neon MCP.',
    'neon',
    'https://mcp.neon.tech/mcp',
    'oauth',
    'https://neon.tech/docs/ai/neon-mcp'
  ),
  (
    'cloudflare',
    'Cloudflare',
    'Workers, KV, R2, and DNS via Cloudflare MCP.',
    'cloudflare',
    'https://mcp.cloudflare.com/mcp',
    'oauth',
    'https://developers.cloudflare.com/agents/model-context-protocol/'
  ),
  (
    'monday',
    'monday.com',
    'Boards, items, and projects via monday.com MCP.',
    'monday',
    'https://mcp.monday.com/mcp',
    'oauth',
    'https://developer.monday.com/api-reference/docs/mcp'
  ),
  (
    'asana',
    'Asana',
    'Projects, tasks, and timelines via Asana MCP.',
    'asana',
    'https://mcp.asana.com/mcp',
    'oauth',
    'https://developers.asana.com/docs/using-asanas-mcp-server'
  ),
  (
    'box',
    'Box',
    'Enterprise file storage and sharing via Box MCP.',
    'box',
    'https://mcp.box.com/mcp',
    'oauth',
    'https://developer.box.com/guides/box-mcp/'
  ),
  (
    'paypal',
    'PayPal',
    'Invoices, payments, and transactions via PayPal MCP.',
    'paypal',
    'https://mcp.paypal.com/http',
    'oauth',
    'https://developer.paypal.com/community/blog/paypal-mcp-server/'
  ),
  (
    'amplitude',
    'Amplitude',
    'Product analytics and user journeys via Amplitude MCP.',
    'amplitude',
    'https://mcp.amplitude.com/mcp',
    'oauth',
    'https://amplitude.com/docs/analytics/amplitude-mcp'
  ),
  (
    'exa',
    'Exa',
    'AI-powered semantic web search via Exa MCP.',
    'exa',
    'https://mcp.exa.ai/mcp',
    'bearer',
    'https://docs.exa.ai/reference/exa-mcp'
  ),
  (
    'ahrefs',
    'Ahrefs',
    'Backlinks, keywords, and SEO data via Ahrefs MCP.',
    'ahrefs',
    'https://api.ahrefs.com/mcp/mcp',
    'bearer',
    'https://docs.ahrefs.com/docs/api/mcp'
  ),
  (
    'semrush',
    'Semrush',
    'SEO data, traffic, and competitor intel via Semrush MCP.',
    'semrush',
    'https://mcp.semrush.com/v1/mcp',
    'oauth',
    'https://developer.semrush.com/api/v3/mcp/'
  ),
  (
    'x-docs',
    'X Docs',
    'Search X (Twitter) API documentation — no auth required.',
    'x',
    'https://docs.x.com/mcp',
    'none',
    'https://docs.x.com/tools/mcp'
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  mcp_url = excluded.mcp_url,
  auth_type = excluded.auth_type,
  docs_url = excluded.docs_url;
