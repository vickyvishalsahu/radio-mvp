import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JwtPayload } from "../types/index.js";

export default fp(async (fastify: FastifyInstance) => {
  fastify.register(jwt, {
    secret: process.env.JWT_SECRET!,
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const payload = await request.jwtVerify<JwtPayload>();
        request.userId = payload.userId;
      } catch {
        reply.code(401).send({ error: "Unauthorized", code: "INVALID_TOKEN" });
      }
    }
  );
});
