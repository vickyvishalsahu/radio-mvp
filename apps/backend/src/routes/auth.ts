import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { spotifyAuth } from "../services/spotifyClient.js";
import type { JwtPayload } from "../types/index.js";

// In-memory state store for CSRF protection.
// Each state UUID expires after 10 minutes.
const pendingStates = new Map<string, number>();

const STATE_TTL_MS = 10 * 60 * 1000;

const cleanExpiredStates = () => {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt < now) pendingStates.delete(state);
  }
};

export default async (fastify: FastifyInstance, { prisma }: { prisma: PrismaClient }) => {
  fastify.get("/auth/spotify/login", async (_request, reply) => {
    cleanExpiredStates();
    const state = crypto.randomUUID();
    pendingStates.set(state, Date.now() + STATE_TTL_MS);
    return reply.redirect(spotifyAuth.getAuthorizationUrl(state));
  });

  fastify.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/auth/spotify/callback", async (request, reply) => {
    const { code, state, error } = request.query;

    if (error) {
      return reply.code(400).send({ error: "Spotify auth denied", detail: error });
    }

    if (!code || !state || !pendingStates.has(state)) {
      return reply.code(400).send({ error: "Invalid or expired state" });
    }

    const expiresAt = pendingStates.get(state)!;
    pendingStates.delete(state);

    if (expiresAt < Date.now()) {
      return reply.code(400).send({ error: "State expired" });
    }

    const tokens = await spotifyAuth.exchangeCode(code);
    const spotifyUser = await spotifyAuth.getCurrentUser(tokens.access_token);

    const user = await prisma.user.upsert({
      where: { spotifyId: spotifyUser.id },
      create: {
        spotifyId: spotifyUser.id,
        displayName: spotifyUser.display_name ?? spotifyUser.id,
        email: spotifyUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        displayName: spotifyUser.display_name ?? spotifyUser.id,
        email: spotifyUser.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });

    const payload: JwtPayload = { userId: user.id };
    const token = fastify.jwt.sign(payload, { expiresIn: "7d" });

    return reply.send({ token });
  });
};
