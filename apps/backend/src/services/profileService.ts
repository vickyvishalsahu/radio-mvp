import type { PrismaClient } from '@prisma/client'
import type { Redis } from 'ioredis'
import { spotifyClient } from './spotifyClient.js'
import { inferFeaturesFromGenres } from './featureInference.js'
import type { TasteProfile } from '../types/profile.js'

const PROFILE_TTL = 2 * 60 * 60 // 2 hours

export const buildTasteProfile = async (
  userId: string,
  prisma: PrismaClient,
  redis: Redis,
): Promise<TasteProfile> => {
  const token = await spotifyClient.getTokenForUser(userId, prisma)

  const [topArtists, recentTracks] = await Promise.all([
    spotifyClient.getTopArtists(token),
    spotifyClient.getRecentlyPlayed(token),
  ])

  const topArtistIds = topArtists.map(a => a.id)
  const topGenres = [...new Set(topArtists.flatMap(a => a.genres))].slice(0, 10)

  const audioFeatureWeights = inferFeaturesFromGenres(topGenres)

  const recentTrackIds = recentTracks.map(t => t.id)

  // Radio's own play history from Postgres (last 200)
  const playEvents = await prisma.playEvent.findMany({
    where: { userId },
    orderBy: { playedAt: 'desc' },
    take: 200,
    select: { trackId: true },
  })
  const radioTrackIds = playEvents.map(e => e.trackId)

  const profile: TasteProfile = {
    userId,
    topArtistIds,
    topGenres,
    audioFeatureWeights,
    recentTrackIds,
    radioTrackIds,
    updatedAt: new Date(),
  }

  // Persist to Postgres
  await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      topArtistIds,
      topGenres,
      audioFeatureWeights,
      recentTrackIds,
      radioTrackIds,
    },
    update: {
      topArtistIds,
      topGenres,
      audioFeatureWeights,
      recentTrackIds,
      radioTrackIds,
    },
  })

  // Cache in Redis
  await redis.set(`user:${userId}:profile`, JSON.stringify(profile), 'EX', PROFILE_TTL)

  return profile
}

export const getTasteProfile = async (
  userId: string,
  prisma: PrismaClient,
  redis: Redis,
): Promise<TasteProfile> => {
  const cached = await redis.get(`user:${userId}:profile`)
  if (cached) return JSON.parse(cached) as TasteProfile
  return buildTasteProfile(userId, prisma, redis)
}

