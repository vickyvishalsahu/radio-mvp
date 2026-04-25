// Debug/testing route — used to inspect and pre-warm the candidate pool.
// Not called directly by the client in production.
import type { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@prisma/client'
import { buildContextVector } from '../services/contextService.js'
import { getCandidatePool } from '../services/poolService.js'
import { spotifyClient } from '../services/spotifyClient.js'
import type { RawContext } from '../types/context.js'

export default async (fastify: FastifyInstance, { prisma }: { prisma: PrismaClient }) => {
  fastify.post<{ Body: RawContext }>(
    '/pool/build',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const cv = await buildContextVector(request.body, request.userId, fastify.redis)
      const pool = await getCandidatePool(request.userId, cv, prisma, fastify.redis, spotifyClient)
      return { count: pool.length, pool }
    },
  )
}
