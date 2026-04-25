import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'
import { spotifyClient } from './spotifyClient.js'
import { getTasteProfile } from './profileService.js'
import type { CandidateTrack, TrackFeatures } from '../types/profile.js'
import type { ContextVector } from '../types/context.js'
import type { ProviderTrack } from '../types/musicProvider.js'

const POOL_TTL = 4 * 60 * 60 // 4 hours
const MIN_POOL_SIZE = 20

const contextBucket = (cv: ContextVector) =>
  `${cv.timeSlot}:${cv.movementState}:${cv.weatherMood}`

const midpoint = (range: [number, number]) => (range[0] + range[1]) / 2

const trackInContext = (track: CandidateTrack, cv: ContextVector): boolean => {
  // Synthetic tracks have no real features — always admit them and let scoring sort it out
  if (track.hasRealFeatures === false) return true

  const tf = cv.targetFeatures
  const f = track.features
  return (
    f.energy >= tf.energy[0] && f.energy <= tf.energy[1] &&
    f.valence >= tf.valence[0] && f.valence <= tf.valence[1] &&
    f.acousticness >= tf.acousticness[0] && f.acousticness <= tf.acousticness[1]
  )
}

const neutralFeatures = (): TrackFeatures => ({
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  acousticness: 0.5,
  instrumentalness: 0.3,
  danceability: 0.5,
  loudness: -8,
})

const toLibraryCandidate = (track: ProviderTrack, savedIds: Set<string>): CandidateTrack => ({
  trackId:         track.id,
  trackName:       track.name,
  artistId:        track.artists[0]?.id ?? '',
  artistName:      track.artists[0]?.name ?? '',
  albumId:         track.album.id,
  albumName:       track.album.name,
  albumArtUrl:     track.album.images[0]?.url ?? '',
  durationMs:      track.duration_ms,
  previewUrl:      track.preview_url ?? null,
  features:        neutralFeatures(),
  popularity:      track.popularity,
  isInLibrary:     savedIds.has(track.id),
  source:          'library',
  hasRealFeatures: false,
})

export const buildCandidatePool = async (
  userId: string,
  cv: ContextVector,
  prisma: PrismaClient,
  redis: Redis,
): Promise<CandidateTrack[]> => {
  const profile = await getTasteProfile(userId, prisma, redis)
  const token = await spotifyClient.getTokenForUser(userId, prisma)
  const excludeIds = new Set([...profile.recentTrackIds, ...profile.radioTrackIds])

  // Fetch all three sources concurrently
  const [savedTracks, recTracks, discoveryTracks] = await Promise.all([
    spotifyClient.getSavedTracks(token),
    spotifyClient.getRecommendations(token, {
      seedArtistIds:  profile.topArtistIds.slice(0, 2),
      seedGenreNames: profile.topGenres.slice(0, 3),
      targetFeatures: cv.targetFeatures,
      limit:          100,
    }),
    cv.discoveryWeight > 0.4
      ? spotifyClient.getRecommendations(token, {
          seedArtistIds:  profile.topArtistIds.slice(2, 5),
          targetFeatures: cv.targetFeatures,
          limit:          50,
        })
      : Promise.resolve([] as CandidateTrack[]),
  ])

  const savedIds = new Set(savedTracks.map(track => track.id))

  const libraryPool = savedTracks
    .filter(track => !excludeIds.has(track.id))
    .map(track => toLibraryCandidate(track, savedIds))
    .filter(candidate => trackInContext(candidate, cv))

  // Rec tracks come back as CandidateTrack[] from the provider.
  // Fix up isInLibrary here since the provider doesn't know the saved set.
  const toLibraryFlagged = (track: CandidateTrack): CandidateTrack =>
    savedIds.has(track.trackId) ? { ...track, isInLibrary: true } : track

  const recPool = recTracks
    .filter(track => !excludeIds.has(track.trackId))
    .map(toLibraryFlagged)
    .filter(candidate => trackInContext(candidate, cv))

  const discoveryPool = discoveryTracks
    .filter(track => !excludeIds.has(track.trackId))
    .map(toLibraryFlagged)
    .filter(candidate => trackInContext(candidate, cv))

  // Merge — library takes precedence on duplicates (~40% library, ~40% rec, ~20% discovery)
  const seen = new Set<string>()
  const pool: CandidateTrack[] = []

  for (const track of [...libraryPool, ...recPool, ...discoveryPool]) {
    if (!seen.has(track.trackId)) {
      seen.add(track.trackId)
      pool.push(track)
    }
  }

  const bucket = contextBucket(cv)
  console.log(`[pool] built ${pool.length} candidates for ${userId} bucket=${bucket}`)
  await redis.set(`pool:${userId}:${bucket}`, JSON.stringify(pool), 'EX', POOL_TTL)

  return pool
}

export const getCandidatePool = async (
  userId: string,
  cv: ContextVector,
  prisma: PrismaClient,
  redis: Redis,
): Promise<CandidateTrack[]> => {
  const bucket = contextBucket(cv)
  const cached = await redis.get(`pool:${userId}:${bucket}`)

  if (cached) {
    const pool = JSON.parse(cached) as CandidateTrack[]
    if (pool.length > MIN_POOL_SIZE) {
      console.log(`[pool] cache hit — ${pool.length} tracks for bucket=${bucket}`)
      return pool
    }
  }

  return buildCandidatePool(userId, cv, prisma, redis)
}
