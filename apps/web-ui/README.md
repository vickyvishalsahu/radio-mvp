# @radio/web-ui

The frontend for Radio. Built with Next.js 15 App Router.

Handles Spotify OAuth, the player UI, and playback via the Spotify Web Playback SDK. Talks to `@radio/backend` for track selection and session state.

> See the [root README](../../README.md) for full setup, commands, and the explanation of why we use `127.0.0.1` instead of `localhost`.

---

## Running

```bash
# From the monorepo root (recommended)
pnpm dev                               # starts both apps
pnpm dev --filter=@radio/web-ui        # starts only this app

# From this directory
pnpm dev
```

Runs on `http://127.0.0.1:3000` — **not** `localhost:3000`. See the root README for why.

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | From [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3000` — do not change this locally |

---

## Spotify OAuth quirk

The dev server binds to `127.0.0.1` (not `localhost`) because Spotify's OAuth redirect URI must exactly match what's registered in the dashboard, and Spotify won't accept `localhost` as a redirect host. The registered URI is:

```
http://127.0.0.1:3000/api/auth/spotify/callback
```

The `-H 127.0.0.1` flag in the `dev` script and the redirect in `src/middleware.ts` enforce this.

---

## Key files

```
src/
├── app/
│   ├── page.tsx                        # Landing page — sign in CTA
│   ├── radio/page.tsx                  # Player screen
│   └── api/
│       ├── auth/spotify/route.ts       # OAuth initiation — redirects to Spotify
│       ├── auth/spotify/callback/      # OAuth callback — exchanges code, sets cookies
│       ├── auth/signout/               # Clears auth cookies
│       └── spotify/play/              # Starts playback via Web Playback SDK
├── components/
│   ├── RadioPlayer.tsx                 # Main player orchestrator
│   ├── Player.tsx                      # Player UI shell
│   ├── AlbumArt.tsx                    # Blurred background + centered art
│   ├── TrackInfo.tsx                   # Artist + track name
│   ├── QuoteRotator.tsx                # Rotating quotes
│   └── ProgressBar.tsx                 # Thin progress indicator
├── hooks/
│   └── useSpotifyPlayer.ts             # Web Playback SDK lifecycle hook
├── lib/
│   ├── spotify/auth.ts                 # OAuth URL builder + token exchange
│   ├── colors.ts                       # Album art dominant color extraction
│   └── quotes.ts                       # Quote data + rotation logic
└── middleware.ts                       # Auth guard + localhost → 127.0.0.1 redirect
```

---

## Auth flow

```
User clicks "Sign in with Spotify"
  → GET /api/auth/spotify          (sets state cookie, redirects to Spotify)
  → Spotify login
  → GET /api/auth/spotify/callback (exchanges code, sets access/refresh token cookies)
  → Redirect to /radio
```

Tokens are stored in cookies (`spotify_access_token`, `spotify_refresh_token`). The middleware checks for `spotify_access_token` to protect `/radio`.
