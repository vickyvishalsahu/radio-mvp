import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { buildContextVector } from '../services/contextService.js'
import { getCandidatePool } from '../services/poolService.js'
import { getTasteProfile } from '../services/profileService.js'
import { scoreAndPick } from '../services/scoringEngine.js'
import { checkContinuity } from '../services/continuityService.js'
import { spotifyClient } from '../services/spotifyClient.js'
import type { RawContext } from '../types/context.js'
import type { SessionState, RecentTrackEntry } from '../types/session.js'

type NextTrackBody = {
  context: RawContext
  lastTrack: { trackId: string; albumId: string; completionPct: number } | null
  sessionId: string | null
}

const SESSION_TTL = 24 * 60 * 60 // 24 hours
const MAX_RECENT_TRACKS = 10
const MAX_ENERGY_TRAJECTORY = 5

const formatTimeSlot = (slot: string) => slot.replace('_', ' ')

const contextBadge = (cv: { timeSlot: string; weatherMood: string; movementState: string }) =>
  [formatTimeSlot(cv.timeSlot), cv.weatherMood, cv.movementState].join(' · ')

export default async (fastify: FastifyInstance, { prisma }: { prisma: PrismaClient }) => {
  fastify.post<{ Body: NextTrackBody }>(
    '/next-track',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const start = Date.now()
      const { context, lastTrack, sessionId: incomingSessionId } = request.body
      const userId = request.userId
      const redis = fastify.redis

      // 1. Resolve or create session
      let session: SessionState
      const sessionKey = incomingSessionId
        ? `session:${userId}:${incomingSessionId}`
        : null

      const sessionRaw = sessionKey ? await redis.get(sessionKey) : null

      if (sessionRaw) {
        session = JSON.parse(sessionRaw) as SessionState
      } else {
        const newId = crypto.randomUUID()
        session = { sessionId: newId, userId, recentTracks: [], energyTrajectory: [] }
        // Create Postgres Session record asynchronously — not on the critical path
        Promise.resolve().then(() =>
          prisma.session.create({ data: { id: newId, userId } }).catch(() => {})
        )
      }

      // 2. Write PlayEvent asynchronously — does not block response
      if (lastTrack) {
        setImmediate(() => {
          prisma.playEvent.create({
            data: {
              userId,
              sessionId: session.sessionId,
              trackId: lastTrack.trackId,
              trackName: '',
              artistName: '',
              completionPct: lastTrack.completionPct,
              contextSnapshot: context as object,
            },
          }).catch(() => {})
        })
      }

      // 3. Build context vector + load pool and profile in parallel
      const [cv, profile] = await Promise.all([
        buildContextVector(context, userId, redis),
        getTasteProfile(userId, prisma, redis, spotifyClient),
      ])

      // 4. Load candidate pool (pipeline pool read alongside other work above if possible)
      const pool = await getCandidatePool(userId, cv, prisma, redis, spotifyClient)

      if (pool.length === 0) {
        return reply.code(503).send({ error: 'No candidate tracks available — try again in a moment' })
      }

      // 5. Check continuity (only if last track was from a gapless album)
      const continuityHint = lastTrack
        ? await checkContinuity(lastTrack, prisma, redis)
        : null

      // 6. Score and pick
      const picked = scoreAndPick(pool, cv, profile, session, continuityHint)

      // 7. Update session state
      const newEntry: RecentTrackEntry = {
        trackId: picked.trackId,
        artistId: picked.artistId,
        energy: picked.features.energy,
        valence: picked.features.valence,
        playedAt: Date.now(),
      }
      session.recentTracks = [newEntry, ...session.recentTracks].slice(0, MAX_RECENT_TRACKS)
      session.energyTrajectory = [picked.features.energy, ...session.energyTrajectory].slice(0, MAX_ENERGY_TRAJECTORY)

      await redis.set(
        `session:${userId}:${session.sessionId}`,
        JSON.stringify(session),
        'EX',
        SESSION_TTL,
      )

      console.log(`[next-track] ${Date.now() - start}ms — picked "${picked.trackName}" by ${picked.artistName}`)

      return reply.send({
        track: {
          trackId: picked.trackId,
          trackName: picked.trackName,
          artistName: picked.artistName,
          albumName: picked.albumName,
          albumArt: picked.albumArtUrl,
          durationMs: picked.durationMs,
          previewUrl: picked.previewUrl,
        },
        sessionId: session.sessionId,
        contextBadge: contextBadge(cv),
      })
    },
  )
}
