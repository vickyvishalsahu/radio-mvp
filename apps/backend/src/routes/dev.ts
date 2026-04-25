// DEV ONLY — remove before production
// Accepts the Spotify access token from the frontend cookie, upserts the user
// in Postgres, and returns a backend JWT. No separate OAuth flow needed.
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { spotifyAuth } from '../services/spotifyClient.js'
import type { JwtPayload } from '../types/index.js'

export default async (fastify: FastifyInstance, { prisma }: { prisma: PrismaClient }) => {
  if (process.env.NODE_ENV === 'production') return

  fastify.get<{ Querystring: { spotify_token?: string } }>('/dev/token', async (request, reply) => {
    const spotifyToken = request.query.spotify_token

    if (spotifyToken) {
      const spotifyUser = await spotifyAuth.getCurrentUser(spotifyToken)
      const user = await prisma.user.upsert({
        where: { spotifyId: spotifyUser.id },
        create: {
          spotifyId: spotifyUser.id,
          displayName: spotifyUser.display_name ?? spotifyUser.id,
          email: spotifyUser.email,
          accessToken: spotifyToken,
          refreshToken: 'dev-placeholder',
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        },
        update: {
          accessToken: spotifyToken,
          tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        },
      })
      const payload: JwtPayload = { userId: user.id }
      const token = fastify.jwt.sign(payload, { expiresIn: '7d' })
      return { token, userId: user.id, displayName: user.displayName }
    }

    const user = await prisma.user.findFirst()
    if (!user) return reply.code(404).send({ error: 'Pass ?spotify_token=<token> from your browser cookies' })
    const payload: JwtPayload = { userId: user.id }
    const token = fastify.jwt.sign(payload, { expiresIn: '7d' })
    return { token, userId: user.id, displayName: user.displayName }
  })
}
