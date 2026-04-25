# Radio

**One channel. No choices. Just listen.**

Radio is a context-aware music player built on Spotify. It reads your moment — time of day, location, movement, weather — and plays music that fits. No playlists. No algorithm you have to train. You press play and the right thing happens.

Requires a Spotify Premium account.

---

## Monorepo structure

```
radio-mvp/
├── apps/
│   ├── web-ui/      # Next.js 15 frontend — the player UI and Spotify OAuth
│   └── backend/     # Fastify API — context engine, scoring, background jobs
├── packages/        # Shared code (types, utilities) — future use
├── docker-compose.yml
├── turbo.json
└── package.json
```

### Why is there a separate backend alongside Next.js?

Next.js API routes are stateless — they spin up per request and die immediately. That's fine for simple CRUD, but Radio needs things that don't fit that model:

- **Background workers** (BullMQ) that learn from what you listen to and refresh track pools continuously
- **Long-lived Redis connections** for caching context vectors, candidate pools, and session state
- **Token concurrency safety** — multiple workers refreshing Spotify tokens needs a mutex, which requires a persistent process
- **Independent scaling** — the scoring engine is CPU-bound; the UI is IO-bound; separating them means you can scale each as needed

The frontend handles what the browser needs (OAuth, Spotify Web Playback SDK, UI). The backend handles everything else.

---

## Why `http://127.0.0.1:3000` instead of `http://localhost:3000`?

This is the most confusing thing about this repo. Here's the full explanation:

Spotify's OAuth flow works like this: your app sends the user to Spotify to log in, and Spotify redirects them back to a "callback URL" you registered in the Spotify Developer Dashboard. That URL must match **exactly** — including protocol, host, and port.

**The problem:** Spotify's developer dashboard (as of 2024) accepts `127.0.0.1` as a local dev host but **rejects `localhost`** — it shows a "not secure" warning and won't let you save it. We couldn't register `http://localhost:3000/api/auth/spotify/callback`.

**What we did instead:**
1. Registered `http://127.0.0.1:3000/api/auth/spotify/callback` in the Spotify dashboard ✅
2. The Next.js dev server starts bound to `127.0.0.1` using the `-H 127.0.0.1` flag (see `apps/web-ui/package.json`)
3. `apps/web-ui/src/middleware.ts` redirects any `localhost:3000` request to `127.0.0.1:3000` so you don't get confused

**tl;dr:** Always open `http://127.0.0.1:3000` in your browser. Never `localhost:3000`.

The backend runs on `http://localhost:3001` — no Spotify redirect involved there, so localhost is fine.

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 10+ — `npm install -g pnpm`
- **Docker** — for Postgres and Redis

---

## First-time setup

### 1. Start infrastructure

If you don't already have Postgres and Redis running:

```bash
docker compose up -d
```

> If port 5432 or 6379 is already in use by another project, skip this step and reuse those containers — just make sure your `.env` files point to the right ports.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

**Frontend** (`apps/web-ui/.env.local`):
```
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

**Backend** (`apps/backend/.env`):
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/radio
REDIS_URL=redis://localhost:6379
SPOTIFY_CLIENT_ID=<same as above>
SPOTIFY_CLIENT_SECRET=<same as above>
SPOTIFY_REDIRECT_URI=http://localhost:3001/auth/spotify/callback
JWT_SECRET=<any long random string — run: openssl rand -hex 32>
PORT=3001
ANTHROPIC_API_KEY=<Claude API key — get one at console.anthropic.com>
```

Copy the examples to get started:
```bash
cp apps/web-ui/.env.example apps/web-ui/.env.local
cp apps/backend/.env.example apps/backend/.env
```

### 4. Spotify Developer Dashboard

Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app (or use an existing one). Add these redirect URIs:

```
http://127.0.0.1:3000/api/auth/spotify/callback
```

### 5. Run database migrations

```bash
# Must be run from the backend directory
cd apps/backend
pnpm prisma migrate dev --name init
cd ../..
```

### 6. Start everything

```bash
pnpm dev
```

This starts both the frontend (port 3000) and backend (port 3001) in parallel via Turborepo.

Open `http://127.0.0.1:3000` in your browser.

---

## Running in dev

| What | Command | Notes |
|---|---|---|
| Everything | `pnpm dev` | Runs both apps in parallel |
| Frontend only | `pnpm dev --filter=@radio/web-ui` | Port 3000 |
| Backend only | `pnpm dev --filter=@radio/backend` | Port 3001 |

---

## All commands

### Root level (run from `radio-mvp/`)

| Command | What it does |
|---|---|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm build` | Build all apps |
| `pnpm typecheck` | TypeScript check across all apps |
| `pnpm lint` | Lint across all apps |
| `pnpm clean` | Delete build artifacts (`.next`, `dist`) |
| `pnpm clean:deep` | Nuclear clean — deletes `node_modules`, `dist`, `.turbo`, `.next` |
| `pnpm build:fresh` | `clean:deep` + `pnpm install` + `build` — use when things are broken |
| `pnpm release` | Merge dev → main with version tag |

### Run a command in a specific app from root

```bash
# Run any script in a specific app
pnpm --filter=@radio/web-ui <script>
pnpm --filter=@radio/backend <script>

# Examples
pnpm --filter=@radio/backend typecheck
pnpm --filter=@radio/web-ui build
```

### Database (must run from `apps/backend/`)

```bash
cd apps/backend

pnpm prisma migrate dev --name <description>   # create + apply a migration
pnpm prisma migrate deploy                     # apply migrations (production)
pnpm prisma studio                             # open visual DB browser
pnpm prisma generate                           # regenerate Prisma client after schema change
```

---

## Environment variables

### `apps/web-ui`

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | Your Spotify app's client ID |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app's client secret |
| `NEXT_PUBLIC_APP_URL` | Base URL of the frontend. Must be `http://127.0.0.1:3000` locally — see the 127.0.0.1 explanation above |

### `apps/backend`

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SPOTIFY_CLIENT_ID` | Same as frontend |
| `SPOTIFY_CLIENT_SECRET` | Same as frontend |
| `SPOTIFY_REDIRECT_URI` | Backend OAuth callback. Must match exactly what's in the Spotify dashboard |
| `JWT_SECRET` | Secret for signing JWTs. Generate with `openssl rand -hex 32` |
| `PORT` | Backend port (default: 3001) |
| `NEWS_API_KEY` | Optional. From [newsapi.org](https://newsapi.org) — used for sentiment scoring |
| `ANTHROPIC_API_KEY` | Claude API key — powers the LLM music intelligence layer. Get one at [console.anthropic.com](https://console.anthropic.com) |

---

## API debugging

The backend has its own auth system (JWT-based) that is separate from the frontend's cookie-based Spotify session. To test backend endpoints directly with curl, you need a JWT.

### Step 1 — Sign in via the frontend

Open `http://127.0.0.1:3000` and sign in with Spotify. This creates your user record in Postgres.

### Step 2 — Get your JWT

Open browser DevTools → **Application** → **Cookies** → `http://127.0.0.1:3000` → copy the value of `spotify_access_token`.

Then run:
```bash
curl "http://localhost:3001/dev/token?spotify_token=<paste-here>"
```

This returns:
```json
{ "token": "eyJ...", "userId": "...", "displayName": "..." }
```

Copy the `token` value. This is your Bearer token for all curl requests. Valid for 7 days.

> `/dev/token` is a development-only route. It does not exist in production.

### Step 3 — Test the API

```bash
# Health check (no auth required)
curl http://localhost:3001/health

# Build context vector from location + time signals
curl -X POST http://localhost:3001/context/vector \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 52.52,
    "lng": 13.40,
    "movementBpm": null,
    "deviceType": "desktop",
    "headphonesConnected": true,
    "localTimestamp": "2026-04-25T10:30:00"
  }'

# Build candidate track pool (hits Spotify API — takes 2–4s on first call)
curl -X POST http://localhost:3001/pool/build \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 52.52,
    "lng": 13.40,
    "movementBpm": null,
    "deviceType": "desktop",
    "headphonesConnected": true,
    "localTimestamp": "2026-04-25T10:30:00"
  }'
```

Second call to `/pool/build` returns from Redis cache — watch the backend logs for `[pool] cache hit`.

---

## Build status

| Phase | What it covers | Status |
|---|---|---|
| 1 | Fastify scaffold, Spotify OAuth, JWT auth, Prisma schema | ✅ Done |
| 2 | Context vector builder — time, location, weather, movement | ✅ Done |
| 3 | Taste profile · `MusicCatalog` (Spotify search) · `MusicIntelligence` (Claude Haiku) · candidate pool | ✅ Done |
| 4 | `/next-track` hot path — scoring engine, session state | ✅ Done |
| 5 | BullMQ workers — feedback loop, background pool refresh, profile sync | ⏳ Not started |
| 6 | Hardening — rate limiting, error handling, structured logging | ⏳ Not started |

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Fastify, TypeScript, Prisma, PostgreSQL, Redis |
| Monorepo | pnpm workspaces, Turborepo |
| Music | Spotify Web API, Spotify Web Playback SDK |
| Deployment | Vercel (frontend), TBD (backend) |
