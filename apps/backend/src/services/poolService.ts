import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'
import { spotifyClient } from './spotifyClient.js'
import { getTasteProfile } from './profileService.js'
import type { CandidateTrack } from '../types/profile.js'
import type { ContextVector } from '../types/context.js'

const POOL_TTL = 4 * 60 * 60 // 4 hours
const MIN_POOL_SIZE = 20

const contextBucket = (cv: ContextVector) =>
  `${cv.timeSlot}:${cv.movementState}:${cv.weatherMood}`

const midpoint = (range: [number, number]) => (range[0] + range[1]) / 2

const inRange = (val: number, range: [number, number]) => val >= range[0] && val <= range[1]

const trackInContext = (features: CandidateTrack['features'], cv: ContextVector): boolean => {
  const tf = cv.targetFeatures
  return (
    inRange(features.energy, tf.energy) &&
    inRange(features.valence, tf.valence) &&
    inRange(features.acousticness, tf.acousticness)
  )
}

export const buildCandidatePool = async (
  userId: string,
  cv: ContextVector,
  prisma: PrismaClient,
  redis: Redis,
): Promise<CandidateTrack[]> => {
  const profile = await getTasteProfile(userId, prisma, redis)
  const token = await spotifyClient.getTokenForUser(userId, prisma)
  const excludeIds = new Set([...profile.recentTrackIds, ...profile.radioTrackIds])

  const featureTargets = {
    targetEnergy: midpoint(cv.targetFeatures.energy),
    minEnergy: cv.targetFeatures.energy[0],
    maxEnergy: cv.targetFeatures.energy[1],
    targetValence: midpoint(cv.targetFeatures.valence),
    minValence: cv.targetFeatures.valence[0],
    maxValence: cv.targetFeatures.valence[1],
    targetTempo: midpoint(cv.targetFeatures.tempo),
    targetAcousticness: midpoint(cv.targetFeatures.acousticness),
  }

  // Fetch all three sources concurrently
  const [savedTracks, recTracks, discoveryTracks] = await Promise.all([
    spotifyClient.getSavedTracks(token),
    spotifyClient.getRecommendations(token, {
      seedArtists: profile.topArtistIds.slice(0, 2),
      seedGenres: profile.topGenres.slice(0, 3),
      limit: 100,
      ...featureTargets,
    }),
    cv.discoveryWeight > 0.4
      ? spotifyClient.getRecommendations(token, {
          seedArtists: profile.topArtistIds.slice(2, 5),
          limit: 50,
          ...featureTargets,
        })
      : Promise.resolve([]),
  ])

  // Batch-fetch audio features for all unique tracks
  const allTracks = [...savedTracks, ...recTracks, ...discoveryTracks]
  const uniqueIds = [...new Set(allTracks.map(t => t.id).filter(id => !excludeIds.has(id)))]
  const featureMap = await spotifyClient.getAudioFeatures(token, uniqueIds)

  const savedIds = new Set(savedTracks.map(t => t.id))

  const toCandidates = (
    tracks: typeof savedTracks,
    source: CandidateTrack['source'],
  ): CandidateTrack[] =>
    tracks
      .filter(t => !excludeIds.has(t.id) && featureMap.has(t.id))
      .map(t => ({
        trackId: t.id,
        trackName: t.name,
        artistId: t.artists[0]?.id ?? '',
        artistName: t.artists[0]?.name ?? '',
        albumId: t.album.id,
        albumName: t.album.name,
        durationMs: t.duration_ms,
        features: featureMap.get(t.id)!,
        popularity: t.popularity,
        isInLibrary: savedIds.has(t.id),
        source,
      }))
      .filter(c => trackInContext(c.features, cv))

  const libraryPool = toCandidates(savedTracks, 'library')
  const recPool = toCandidates(recTracks, 'recommendation')
  const discoveryPool = toCandidates(discoveryTracks, 'recommendation')

  // Merge with rough target proportions (~40% library, ~40% rec, ~20% discovery)
  // Dedup by trackId across sources — library takes precedence
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
