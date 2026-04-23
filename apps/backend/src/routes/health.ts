import type { FastifyInstance } from "fastify";

export default async (fastify: FastifyInstance) => {
  fastify.get("/health", async () => ({
    status: "ok",
    ts: Date.now(),
  }));
};
