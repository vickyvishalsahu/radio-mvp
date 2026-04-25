import { PrismaClient } from "@prisma/client";
import type { SpotifyTokenResponse, SpotifyRefreshResponse, SpotifyUser } from "../types/index.js";
import type { CandidateTrack, TrackFeatures } from "../types/profile.js";
import type { MusicProvider, ProviderTrack, ProviderArtist, ProviderAlbumTrack, RecommendationRequest } from "../types/musicProvider.js";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";

const SCOPES = [
  "user-read-private",
  "user-read-email",
  "user-top-read",
  "user-read-recently-played",
  "playlist-modify-public",
  "user-library-read",
].join(" ");

const clientId = process.env.SPOTIFY_CLIENT_ID!;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
const redirectUri = process.env.SPOTIFY_REDIRECT_URI!;

const basicAuth = () =>
  Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

// Not exported — only called internally by getAudioFeatures which is also internal.
// Kept for potential future use if the endpoint becomes available again.
const getAudioFeatures = async (token: string, trackIds: string[]): Promise<Map<string, TrackFeatures>> => {
  const result = new Map<string, TrackFeatures>();
  for (let i = 0; i < trackIds.length; i += 100) {
    const batch = trackIds.slice(i, i + 100);
    const res = await spotifyGet(token, `/audio-features?ids=${batch.join(',')}`);
    const data = await res.json() as { audio_features: Array<SpotifyAudioFeature | null> };
    for (const feat of data.audio_features) {
      if (!feat) continue;
      result.set(feat.id, {
        energy: feat.energy,
        valence: feat.valence,
        tempo: feat.tempo,
        acousticness: feat.acousticness,
        instrumentalness: feat.instrumentalness,
        danceability: feat.danceability,
        loudness: feat.loudness,
      });
    }
  }
  return result;
};

// Auth helpers — not part of the MusicProvider interface, exported separately
export const spotifyAuth = {
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    return `${SPOTIFY_ACCOUNTS_URL}/authorize?${params.toString()}`;
  },

  async exchangeCode(code: string): Promise<SpotifyTokenResponse> {
    const res = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify token exchange failed ${res.status}: ${text}`);
    }

    return res.json() as Promise<SpotifyTokenResponse>;
  },

  async getCurrentUser(accessToken: string): Promise<SpotifyUser> {
    const res = await fetch(`${SPOTIFY_API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify /me failed ${res.status}: ${text}`);
    }

    return res.json() as Promise<SpotifyUser>;
  },
};

export const spotifyClient: MusicProvider = {
  async getTokenForUser(userId: string, prisma: PrismaClient): Promise<string> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const expiresInMs = user.tokenExpiresAt.getTime() - Date.now();
    if (expiresInMs <= 60_000) {
      return refreshAccessToken(userId, prisma);
    }

    return user.accessToken;
  },

  async getTopArtists(token: string): Promise<ProviderArtist[]> {
    const res = await spotifyGet(token, '/me/top/artists?limit=20&time_range=medium_term');
    const data = await res.json() as { items: SpotifyArtist[] };
    return data.items;
  },

  async getTopTracks(token: string): Promise<ProviderTrack[]> {
    const res = await spotifyGet(token, '/me/top/tracks?limit=50&time_range=medium_term');
    const data = await res.json() as { items: SpotifyTrack[] };
    return data.items;
  },

  async getRecentlyPlayed(token: string): Promise<ProviderTrack[]> {
    const res = await spotifyGet(token, '/me/player/recently-played?limit=50');
    const data = await res.json() as { items: Array<{ track: SpotifyTrack }> };
    return data.items.map(item => item.track);
  },

  async getSavedTracks(token: string): Promise<ProviderTrack[]> {
    const res = await spotifyGet(token, '/me/tracks?limit=50');
    const data = await res.json() as { items: Array<{ track: SpotifyTrack }> };
    return data.items.map(item => item.track);
  },

  async getRecommendations(token: string, req: RecommendationRequest): Promise<CandidateTrack[]> {
    const tf = req.targetFeatures
    const targetEnergy      = (tf.energy[0] + tf.energy[1]) / 2
    const targetValence     = (tf.valence[0] + tf.valence[1]) / 2
    const targetTempo       = (tf.tempo[0] + tf.tempo[1]) / 2
    const targetAcousticness = (tf.acousticness[0] + tf.acousticness[1]) / 2

    const query = new URLSearchParams({
      limit: String(req.limit ?? 100),
      ...(req.seedArtistIds?.length ? { seed_artists: req.seedArtistIds.join(',') } : {}),
      ...(req.seedGenreNames?.length ? { seed_genres: req.seedGenreNames.join(',') } : {}),
      target_energy:       String(targetEnergy),
      min_energy:          String(tf.energy[0]),
      max_energy:          String(tf.energy[1]),
      target_valence:      String(targetValence),
      min_valence:         String(tf.valence[0]),
      max_valence:         String(tf.valence[1]),
      target_tempo:        String(targetTempo),
      target_acousticness: String(targetAcousticness),
    });

    const res = await spotifyGet(token, `/recommendations?${query.toString()}`);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 1) * 1000;
      console.warn(`[spotify] rate limited — retrying after ${retryAfter}ms`);
      await sleep(retryAfter);
      const retry = await spotifyGet(token, `/recommendations?${query.toString()}`);
      if (!retry.ok) throw new Error(`Spotify /recommendations failed after retry: ${retry.status}`);
      const data = await retry.json() as { tracks: SpotifyTrack[] };
      return toRecommendationCandidates(data.tracks, req.targetFeatures);
    }

    if (!res.ok) throw new Error(`Spotify /recommendations failed: ${res.status}`);
    const data = await res.json() as { tracks: SpotifyTrack[] };
    return toRecommendationCandidates(data.tracks, req.targetFeatures);
  },

  async getAlbumTracks(token: string, albumId: string): Promise<ProviderAlbumTrack[]> {
    const res = await spotifyGet(token, `/albums/${albumId}/tracks?limit=50`);
    const data = await res.json() as { items: SpotifyAlbumTrack[] };
    return data.items;
  },
};

// Converts raw Spotify tracks to CandidateTrack with synthetic features.
// hasRealFeatures=false signals to the scoring engine to skip distance scoring.
const toRecommendationCandidates = (
  tracks: SpotifyTrack[],
  targetFeatures: RecommendationRequest['targetFeatures'],
): CandidateTrack[] => {
  const midpoint = (range: [number, number]) => (range[0] + range[1]) / 2
  const syntheticFeatures: TrackFeatures = {
    energy:           midpoint(targetFeatures.energy),
    valence:          midpoint(targetFeatures.valence),
    tempo:            midpoint(targetFeatures.tempo),
    acousticness:     midpoint(targetFeatures.acousticness),
    instrumentalness: 0.3,
    danceability:     0.5,
    loudness:         -8,
  }

  return tracks.map(track => ({
    trackId:          track.id,
    trackName:        track.name,
    artistId:         track.artists[0]?.id ?? '',
    artistName:       track.artists[0]?.name ?? '',
    albumId:          track.album.id,
    albumName:        track.album.name,
    albumArtUrl:      track.album.images[0]?.url ?? '',
    durationMs:       track.duration_ms,
    previewUrl:       track.preview_url ?? null,
    features:         syntheticFeatures,
    popularity:       track.popularity,
    isInLibrary:      false, // poolService sets this based on savedIds
    source:           'recommendation' as const,
    hasRealFeatures:  false,
  }))
}

// --- internal helpers ---

const refreshAccessToken = async (userId: string, prisma: PrismaClient): Promise<string> => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const res = await fetch(`${SPOTIFY_ACCOUNTS_URL}/api/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: user.refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as SpotifyRefreshResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? user.refreshToken,
      tokenExpiresAt: expiresAt,
    },
  });

  return data.access_token;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const spotifyGet = async (token: string, path: string): Promise<Response> => {
  const res = await fetch(`${SPOTIFY_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 429) return res; // caller handles rate limit
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify GET ${path} failed ${res.status}: ${text}`);
  }
  return res;
};

// --- Spotify API shapes (internal) ---

type SpotifyArtist = {
  id: string
  name: string
  genres: string[]
}

type SpotifyTrack = {
  id: string
  name: string
  duration_ms: number
  popularity: number
  preview_url: string | null
  artists: Array<{ id: string; name: string }>
  album: { id: string; name: string; images: Array<{ url: string }> }
}

type SpotifyAlbumTrack = {
  id: string
  name: string
  track_number: number
  artists: Array<{ id: string; name: string }>
}

type SpotifyAudioFeature = {
  id: string
  energy: number
  valence: number
  tempo: number
  acousticness: number
  instrumentalness: number
  danceability: number
  loudness: number
}
