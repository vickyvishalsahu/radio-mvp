import type { Redis } from 'ioredis'
import type { PrismaClient } from '@prisma/client'
import { spotifyClient } from './spotifyClient.js'
import type { ContinuityHint } from '../types/session.js'

// Albums where tracks flow directly into each other without silence.
// If the last played track is from one of these albums, we force the next
// track in sequence rather than running the scoring engine.
const GAPLESS_ALBUM_IDS = new Set([
  '1QkLiBXGeIVG2rFRNnSdvs', // Sgt. Pepper's Lonely Hearts Club Band — The Beatles
  '4LH4d3cOWNNsVw41Gqt2kv', // The Dark Side of the Moon — Pink Floyd
  '6dVIqQ8qmQ5GBnJ9shOYgE', // Abbey Road — The Beatles (side 2 medley from track 7)
  '4eLPsYPBmXABThSJ821sqY', // The Wall — Pink Floyd
  '0ETFjACtuP2ADo6LFhL6HN', // Kid A — Radiohead
  '6J7biCQ63jqIR5PqcAoTdV', // In the Aeroplane Over the Sea — Neutral Milk Hotel
  '6FJxoadUE4JNVwWHghBwnb', // OK Computer — Radiohead
  '2WT1pbYjLJciAR26yMebkH', // Led Zeppelin IV
])

const ALBUM_CACHE_TTL = 30 * 24 * 60 * 60 // 30 days

export const checkContinuity = async (
  lastTrack: { trackId: string; albumId: string },
  prisma: PrismaClient,
  redis: Redis,
): Promise<ContinuityHint | null> => {
  if (!GAPLESS_ALBUM_IDS.has(lastTrack.albumId)) return null

  const cacheKey = `album:${lastTrack.albumId}:tracks`
  let tracks: Array<{ id: string; name: string; artists: Array<{ id: string; name: string }>; track_number: number }>

  const cached = await redis.get(cacheKey)
  if (cached) {
    tracks = JSON.parse(cached)
  } else {
    const userId = await redis.get(`album:${lastTrack.albumId}:userId`)
    if (!userId) return null
    const token = await spotifyClient.getTokenForUser(userId, prisma)
    tracks = await spotifyClient.getAlbumTracks(token, lastTrack.albumId)
    await redis.set(cacheKey, JSON.stringify(tracks), 'EX', ALBUM_CACHE_TTL)
  }

  const currentIndex = tracks.findIndex(t => t.id === lastTrack.trackId)
  if (currentIndex === -1 || currentIndex === tracks.length - 1) return null

  const next = tracks[currentIndex + 1]!
  return {
    trackId: next.id,
    trackName: next.name,
    artistName: next.artists[0]?.name ?? '',
    reason: 'gapless album — continuing sequence',
  }
}

// Call this when building a pool so we can later fetch album tracks
// without needing the userId on the hot path.
export const cacheAlbumUserId = async (albumId: string, userId: string, redis: Redis): Promise<void> => {
  await redis.set(`album:${albumId}:userId`, userId, 'EX', ALBUM_CACHE_TTL)
}
