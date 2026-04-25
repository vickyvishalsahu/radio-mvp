# @radio/backend

The Fastify API for Radio. Handles context analysis, track scoring, session state, and background learning.

> See the [root README](../../README.md) for full setup, the API debugging guide, and architecture rationale.

---

## Why this exists alongside Next.js

Next.js API routes are stateless — they can't hold open connections or run continuously. This backend exists because Radio needs:

- **BullMQ workers** that run continuously in the background (phases 5–6)
- **Persistent Redis connections** for caching pools, sessions, and context vectors
- **Spotify token refresh with a mutex** to prevent concurrent refresh races
- **Independent scaling** from the UI

---

## Running

```bash
# From the monorepo root (recommended)
pnpm dev                                 # starts both apps
pnpm dev --filter=@radio/backend         # starts only this app

# From this directory
pnpm dev
```

Runs on `http://localhost:3001`.

---

## Dependencies

Requires Postgres and Redis. Start them with Docker from the repo root:

```bash
# From radio-mvp/
docker compose up -d
```

Or reuse existing containers — just point the `.env` at the right ports.

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify app client secret |
| `SPOTIFY_REDIRECT_URI` | Must match Spotify dashboard exactly |
| `JWT_SECRET` | Sign JWTs — generate with `openssl rand -hex 32` |
| `PORT` | Server port (default: 3001) |
| `NEWS_API_KEY` | Optional — [newsapi.org](https://newsapi.org) for sentiment scoring |

---

## Database

Prisma migrations **must be run from this directory**, not the repo root.

```bash
cd apps/backend

# Create and apply a new migration
pnpm prisma migrate dev --name <description>

# Apply existing migrations (e.g. after pulling changes)
pnpm prisma migrate dev

# Open visual database browser
pnpm prisma studio

# Regenerate Prisma client after schema changes
pnpm prisma generate
```

---

## API routes

### No auth required

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ status: 'ok', ts: <epoch> }` |

### Auth required — `Authorization: Bearer <jwt>`

| Method | Route | Description |
|---|---|---|
| `POST` | `/context/vector` | Build a context vector from device signals |
| `POST` | `/pool/build` | Build + cache a candidate track pool |
| `POST` | `/next-track` | Pick and return the next track |

### Dev only (not available in production)

| Method | Route | Description |
|---|---|---|
| `GET` | `/dev/token` | Get a JWT without going through OAuth — see below |

---

## Getting a JWT for curl testing

The backend uses JWT auth separate from the frontend's cookies. To test endpoints:

**1. Sign in via the frontend** at `http://127.0.0.1:3000` — this creates your user in Postgres.

**2. Get your Spotify access token** from the browser:
- DevTools → Application → Cookies → `http://127.0.0.1:3000`
- Copy the value of `spotify_access_token`

**3. Exchange it for a backend JWT:**
```bash
curl "http://localhost:3001/dev/token?spotify_token=<paste-here>"
```

Response:
```json
{ "token": "eyJ...", "userId": "...", "displayName": "..." }
```

Use the `token` as `Bearer <token>` in subsequent requests. Valid for 7 days.

---

## Music provider

The backend is designed to be music-source agnostic. Spotify is the current implementation, but the architecture anticipates a `MusicProvider` interface — any source (Apple Music, Last.fm, a local database) that implements it can be swapped in without touching the scoring engine or session logic.

> See [DECISIONS.md — ADR-008](../../DECISIONS.md#adr-008) for the full rationale.

**Current status**: `spotifyClient.ts` is the sole provider. The interface extraction is planned as part of the audio-features deprecation fix.

---

## Key files

```
src/
├── index.ts                    # Fastify app entry — registers plugins and routes
├── plugins/
│   ├── auth.ts                 # JWT plugin — fastify.authenticate decorator
│   └── redis.ts                # Redis plugin — fastify.redis decorator
├── routes/
│   ├── health.ts               # GET /health
│   ├── auth.ts                 # GET /auth/spotify/login + /callback
│   ├── context.ts              # POST /context/vector
│   ├── pool.ts                 # POST /pool/build
│   ├── nextTrack.ts            # POST /next-track — hot path
│   └── dev.ts                  # GET /dev/token (dev only)
├── services/
│   ├── spotifyClient.ts        # All Spotify API calls — single source of truth
│   ├── contextService.ts       # Builds ContextVector from raw device signals
│   ├── profileService.ts       # Fetches + caches user taste profile
│   ├── poolService.ts          # Builds + caches candidate track pool
│   ├── scoringEngine.ts        # Pure scoring function — no I/O
│   └── continuityService.ts    # Gapless album sequencing
├── types/
│   ├── index.ts                # JWT payload + Spotify API shapes
│   ├── context.ts              # RawContext, ContextVector
│   ├── profile.ts              # TasteProfile, CandidateTrack
│   └── session.ts              # SessionState, ContinuityHint
└── prisma/
    └── schema.prisma           # User, Session, PlayEvent, UserProfile
```

---

## Build status

| Phase | What | Status |
|---|---|---|
| 1 | Scaffold, OAuth, JWT auth, Prisma schema | ✅ |
| 2 | Context vector — time, weather, location, movement | ✅ |
| 3 | Taste profile + candidate pool | ✅ |
| 4 | `/next-track` scoring engine + session state | ✅ |
| 5 | BullMQ workers — feedback loop, pool refresh | ⏳ |
| 6 | Rate limiting, structured logging, hardening | ⏳ |
