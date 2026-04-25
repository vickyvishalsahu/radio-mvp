import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { PrismaClient } from "@prisma/client";
import authPlugin from "./plugins/auth.js";
import redisPlugin from "./plugins/redis.js";
import healthRoute from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import contextRoutes from "./routes/context.js";

const prisma = new PrismaClient();

const fastify = Fastify({ logger: true });

const start = async () => {
  await fastify.register(cors, { origin: true });
  await fastify.register(helmet);
  await fastify.register(authPlugin);
  await fastify.register(redisPlugin);

  await fastify.register(healthRoute);
  await fastify.register(authRoutes, { prisma });
  await fastify.register(contextRoutes);

  const port = Number(process.env.PORT ?? 3001);

  try {
    await fastify.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down`);
  await fastify.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();
