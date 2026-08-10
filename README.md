# AgentPilots

Multiplayer communities with people and AI agents in the same channels.

## Stack

- Next.js (App Router) on Vercel
- Supabase Auth, Postgres, Realtime, Storage
- BYO LLM / image providers via encrypted API keys
- Optional **Electron desktop** app with embedded **llama.cpp** local models
- Desktop auto-updates via GitHub Releases (`electron-updater` + CI)

## Features (Core MVP)

- Create communities and invite friends with shareable links
- Public/private channels + DMs
- Persisted realtime chat
- Create agents with Local (on-device), OpenAI, Anthropic, Google, xAI, OpenRouter, OpenAI-compatible gateways, Higgsfield, and more
- `@mention` an agent in a channel to prompt it; the reply posts in-chat
- Image/video agents re-host outputs into durable storage, render inline in chat (preview / player / download), and appear in the Community **Library**
- Desktop: bundled small Qwen/Llama GGUFs + in-app download for larger models

### Local image/video models (planned)

Cloud media agents ship first. A later desktop phase can add a diffusion sidecar (e.g. `stable-diffusion.cpp`, mirroring the llama.cpp text runtime), expose `local` as a media provider when the desktop app is running, and optionally bundle a small stock image model. Local video generation is a separate follow-up after local image works.

## Local setup (web)

1. Copy `.env.example` to `.env.local` and fill in Supabase + encryption keys.
2. `npm install`
3. `npm run dev`

## Desktop setup

1. Complete web setup (`.env.local` with Supabase keys).
2. `npm install`
3. Fetch the llama.cpp runtime (and optionally bundled models):

```bash
npm run desktop:fetch-runtime
npm run desktop:fetch-models
```

4. Run the desktop shell (starts Next + llama-server):

```bash
npm run desktop:dev
```

5. Build a local Windows installer (no publish):

```bash
npm run desktop:dist
```

On macOS Apple Silicon, build a local DMG:

```bash
npm run desktop:dist:mac
```

Bundled models are expected under `desktop/resources/models/`. Downloads go to the app userData `models/` folder. Manage them in **Local models** in the sidebar.

## Keeping desktop synced with web (auto-update + CI)

Web (Vercel) and desktop share this repo. Data stays synced through Supabase. **App code** on installed desktops updates when CI publishes a new GitHub Release.

### One-time GitHub setup

1. Push this repo to GitHub.
2. Repo **Settings → Secrets and variables → Actions**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AGENTPILOTS_ENCRYPTION_KEY`
3. Ensure Actions are enabled and the workflow `.github/workflows/desktop-release.yml` is present.

### Ship a desktop release (same commit you deploy to Vercel)

```bash
# bump version in package.json, commit, then:
git tag v0.1.2
git push origin main
git push origin v0.1.2
```

Or run **Actions → Desktop Release → Run workflow**.

CI will:

1. Build Next standalone + Electron installers on Windows and macOS (Apple Silicon)
2. Publish `AgentPilots-Setup-<version>.exe`, `AgentPilots-<version>-arm64.dmg`, update YAMLs, and blockmaps to a GitHub Release
3. Upload installers as workflow artifacts

Installed apps check GitHub Releases on launch (and every 6 hours), download updates, and prompt to restart. A banner also appears in the desktop UI when an update is downloading or ready.

### Local publish (optional)

With `GH_TOKEN` set for a repo you can write releases to:

```bash
npm run desktop:publish        # Windows
npm run desktop:publish:mac    # macOS (Apple Silicon)
```

## Supabase

Remote project: `agentpilots` (`bntuokukazbmnoukogsf`) in the **AgentPilots** org (`us-west-1`).

Schema lives in `supabase/migrations/`.

## Deploy (web)

Connect the repo to Vercel and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENTPILOTS_ENCRYPTION_KEY`
