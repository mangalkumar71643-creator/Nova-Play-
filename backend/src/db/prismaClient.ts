import { PrismaClient } from "@prisma/client";

// On Vercel, a warm serverless instance can be reused across invocations
// but the module is re-evaluated on cold starts and hot reloads — caching
// the client on `globalThis` avoids opening a fresh Postgres connection
// (and exhausting the connection limit) every time. Use a pooled
// connection string (e.g. Neon/Vercel Postgres's pgbouncer URL) for
// DATABASE_URL in serverless environments.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
