# Architecture Decision Records

A log of every significant architectural and product decision made during Radio MVP development. Entries are in chronological order. Each decision is permanent here even if later superseded — the history matters.

---

## ADR-001

**Title**: Turborepo monorepo over separate repos or Next.js-only

**Date**: April 2025  
**Status**: Active

**Decision**: The project is a pnpm workspace monorepo managed by Turborepo, containing two apps (`web-ui`, `backend`) and a `packages/` directory for future shared code.

**Why**: Adding a Fastify backend as a separate service was inevitable once the need for persistent workers and long-lived connections became clear. A monorepo lets both apps share TypeScript config, lint rules, and build tooling without duplication. Turborepo caches build outputs and runs tasks in parallel — faster than two independent repos.

**Alternatives considered**:
- Two separate repos: more friction to keep in sync, no shared tooling
- Next.js-only (no backend): ruled out — see ADR-002

**Consequences**: All dev commands run from the root (`pnpm dev`, `pnpm build`). Prisma migrations are the exception — they must run from `apps/backend/` directly.

---

## ADR-002

**Title**: Separate Fastify backend, not Next.js API routes

**Date**: April 2025  
**Status**: Active

**Decision**: The server-side logic lives in a standalone Fastify process on port 3001, not in Next.js API routes.

**Why**: Next.js API routes are stateless — they spin up per request and die. Radio needs things that don't fit that model:
- BullMQ workers that run continuously in the background
- Persistent Redis connections for caching pools, sessions, and context vectors
- A mutex around Spotify token refresh to prevent concurrent race conditions
- Independent scaling — the scoring engine is CPU-bound; the UI is IO-bound

Vercel (the obvious Next.js host) makes background workers impossible — functions time out at 10–60 seconds and don't persist state.

**Alternatives considered**:
- Next.js API routes + Upstash Redis: could handle caching but not background workers or process-level mutexes
- AWS Lambda: same stateless problem

**Consequences**: Two processes to run locally. Two sets of env vars. Backend deployment is unsolved (TBD — likely Fly.io or Railway).

---

## ADR-003

**Title**: Web-first, native later

**Date**: April 2025  
**Status**: Active

**Decision**: Radio ships as a web app (Next.js) first. Native (iOS/Android) is deferred.

**Why**: Vicky is a frontend developer — web is the fastest path to a working product. The Spotify Web Playback SDK works in the browser without App Store approval. Web lets us iterate without a build/review cycle. Native adds significant complexity (background audio, Bluetooth handoff, OS media controls) that is premature before the core algorithm is validated.

**Alternatives considered**:
- React Native from day one: ruled out due to time cost and unfamiliar territory
- Expo: reasonable but still native-first complexity without proof the algorithm is good

**Consequences**: Spotify Premium required (Web Playback SDK limitation). No offline mode. Mobile web experience will be limited until a native app exists.

---

## ADR-004

**Title**: Spotify as initial music source

**Date**: April 2025  
**Status**: Active (with caveats — see ADR-007, ADR-008)

**Decision**: Spotify is the first music provider — the source of track catalog, audio features, recommendations, and playback.

**Why**: Largest catalog (~100M tracks). Strong recommendation API with feature-based filtering. Existing Web Playback SDK for browser audio. OAuth is well-documented. Familiar to the target user base.

**Alternatives considered**:
- Apple Music: MusicKit JS exists but developer access is harder to get; recommendation API is weaker
- Last.fm: good for discovery/scrobbling but no playback
- Local library: too limited for an MVP

**Consequences**: Spotify Premium required for playback. Dependent on Spotify's API stability — which proved fragile (see ADR-007). Backend must be provider-agnostic to avoid lock-in (see ADR-008).

---

## ADR-005

**Title**: Use `127.0.0.1` instead of `localhost` for local dev

**Date**: April 2025  
**Status**: Active

**Decision**: The Next.js dev server binds to `127.0.0.1:3000` (not `localhost:3000`). All browser URLs during development use `http://127.0.0.1:3000`.

**Why**: Spotify's OAuth dashboard (as of 2024) rejects `localhost` as a redirect URI — it shows a "not secure" warning and refuses to save it. The registered callback URL must be `http://127.0.0.1:3000/api/auth/spotify/callback`. The Next.js dev server starts with `-H 127.0.0.1` to match.

`apps/web-ui/src/middleware.ts` redirects any request to `localhost:3000` → `127.0.0.1:3000` so developers who type the wrong host don't get a broken OAuth flow.

**Alternatives considered**:
- Use a tunnel (ngrok, Cloudflare Tunnel) with a registered HTTPS URL: works but adds infrastructure for a local dev problem
- Use `localhost` and register it anyway: Spotify rejects it

**Consequences**: Every developer must remember to use `127.0.0.1` in the browser. Documented prominently in the root README.

---

## ADR-006

**Title**: Separate JWT auth for the backend (not shared with Next.js session)

**Date**: April 2025  
**Status**: Active

**Decision**: The backend issues its own JWTs (via `fastify-jwt`), separate from the frontend's httpOnly cookie-based Spotify session.

**Why**: Next.js session cookies are httpOnly — they can't be read by JavaScript or forwarded to a different origin. The backend on `localhost:3001` is a different origin from the frontend on `127.0.0.1:3000`. Sharing the cookie across origins would require CORS workarounds and cookie domain tricks that are fragile and insecure.

A dedicated JWT issued by the backend keeps auth clean: the frontend logs in via Spotify OAuth (Next.js), then exchanges the Spotify token for a backend JWT via `/dev/token` (dev) or `/auth/spotify/callback` (prod). All backend API calls use `Authorization: Bearer <jwt>`.

**Alternatives considered**:
- Session cookie shared via shared domain: not applicable locally
- Forward the Spotify access token directly to the backend: the backend still needs its own user record anyway

**Consequences**: Two separate auth flows to understand. A `/dev/token` endpoint bridges the gap in local development (takes the Spotify access token from the browser cookie and returns a backend JWT). This endpoint is disabled in production.

---

## ADR-007

**Title**: Removing the dependency on Spotify's `/audio-features` endpoint

**Date**: April 2025  
**Status**: Active

**Decision**: Stop calling `/audio-features`. Replace with:
- Genre-based feature inference for `audioFeatureWeights` in the taste profile
- Synthetic features (target midpoints from the recommendation params) for pool tracks returned by `/recommendations`
- Neutral default features for saved library tracks

**Why**: Spotify deprecated `/audio-features` for all apps created after November 2024. The endpoint returns 403. Using an older Spotify app (pre-deprecation) was considered but rejected — it would mean building on a deprecated API with no end-of-life guarantee, and it would block the music-provider abstraction goal (ADR-008).

The recommendation endpoint (`/recommendations`) already applies feature targeting server-side — it accepts `target_energy`, `min_energy`, `max_energy`, `target_valence`, etc. as query params. Tracks it returns are already contextually filtered. Assigning synthetic features from those params is a reasonable approximation.

**Alternatives considered**:
- Use a legacy Spotify app (created pre-Nov 2024): short-term fix, borrowed time, blocks provider abstraction
- Use AcousticBrainz or Essentia for features: both deprecated or too complex for MVP
- Use Spotify `/audio-analysis` (different endpoint, not deprecated): returns beat/pitch data, not high-level features like energy/valence — not a drop-in replacement

**Consequences**: Slight reduction in per-track feature scoring precision. Profile affinity score (25/85 pts) is based on genre inference rather than measured track features. Recommendation tracks score well because Spotify already filtered them. Saved library tracks score on library bonus + freshness + diversity, not feature fit — acceptable for MVP.

---

## ADR-008

**Title**: Music-provider abstraction — MusicProvider interface

**Date**: April 2025  
**Status**: Planned (implementation follows ADR-007 fix)

**Decision**: Extract a `MusicProvider` interface that `poolService`, `profileService`, and `continuityService` depend on. `spotifyClient.ts` becomes the first implementation. Future providers (Apple Music, Last.fm, local DB) implement the same interface.

**Why**: ADR-007 exposed that Spotify is a fragile dependency. If a second provider is ever needed, the current architecture requires touching every service that calls `spotifyClient` directly. An interface inverts that dependency — services know what they need (tracks, recommendations, album tracks), not who provides it.

The interface boundary also clarifies what the scoring engine needs: `CandidateTrack[]` with features. It doesn't care who fetched them or how.

**Alternatives considered**:
- Keep calling spotifyClient directly and refactor later: accumulates debt, makes provider swap harder
- Build the abstraction before fixing the 403: correct order is fix first (unblock development), abstract second

**Consequences**: One extra file (`types/musicProvider.ts`). Services accept a `MusicProvider` parameter instead of importing `spotifyClient` at the top. Routes wire up the provider on startup. Negligible runtime cost.

---

## ADR-009

**Title**: Redis for session state, Postgres for durable records

**Date**: April 2025  
**Status**: Active

**Decision**: `SessionState` (recent tracks, energy trajectory) lives in Redis with a 24-hour TTL. Durable records (play history, user profile, session IDs) live in Postgres.

**Why**: Session state changes on every `/next-track` request. Writing it to Postgres on every call would be unnecessarily heavy for data that only matters for the current listening session and that expires naturally. Redis TTL handles expiry for free. Postgres is reserved for data that needs to survive restarts, inform the feedback loop, and be queryable.

**Alternatives considered**:
- Everything in Postgres: works but adds write latency on the hot path for ephemeral data
- Everything in Redis: session TTL is fine for sessions, but play history and taste profiles need durable storage for the feedback loop

**Consequences**: Two stores to run locally (Docker Compose handles this). Session data is lost on Redis restart unless a snapshot exists — acceptable for local dev. Production Redis needs persistence configured.

---

## ADR-010

**Title**: No skip, no queue, no choices — the algorithm decides

**Date**: April 2025  
**Status**: Active

**Decision**: The app does not expose skip, queue management, or track selection to the user. The algorithm picks every track. The user presses play and listens.

**Why**: This is the core product identity. The moment you add skip, you're competing with Spotify and every other streaming app. Radio's proposition is: "trust the algorithm for this moment." Skipping undermines that trust — if users skip, the algorithm must be right; if it's wrong, the product has failed at its one job.

Removing skip also simplifies the backend significantly — no queue state to manage, no skip signal to propagate, no "next track already queued" race condition.

**Alternatives considered**:
- Allow one skip per hour: weakens the concept without solving the underlying problem (algorithm quality)
- Show the next track in advance: creates anticipation anxiety — "that's not what I want right now"

**Consequences**: The algorithm must be good enough that users don't want to skip. This raises the bar on context accuracy and scoring quality. If the algorithm feels wrong, the whole product feels wrong — there is no escape valve.

---

## ADR-011 — MusicCatalog + MusicIntelligence split

Date: April 2025
Status: Active

Decision: Split MusicProvider into MusicCatalog (platform search + playback) and MusicIntelligence (what to play next).

Why: Every streaming platform will deprecate recommendation APIs eventually. Search APIs are stable — they are how users find music. By owning the intelligence layer and using platforms only for search, we have a durable architecture with no dependency on any platform's recommendation engine.

Alternatives considered:
- Keep MusicProvider as one interface: conflates two concerns with different change rates
- Build our own catalog: too expensive for MVP

Consequences: MusicIntelligence needs an implementation. First candidate: Last.fm tags API or LLM — decision deferred to Dolores.
