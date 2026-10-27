/**
 * Which database the server uses. Normally DATABASE_URL (Neon, AWS
 * us-east-1). With DB_TARGET=sg it is the Singapore database Vercel's Neon
 * integration added with the env prefix "SGDB" — closer to the players in
 * India. Only the flag switches it, so adding the new database to the
 * project never moves the server onto it (still empty) by itself.
 */
const SG_PREFIX = "SGDB";

function firstSet(names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

export function usesSingaporeDb(): boolean {
  return process.env.DB_TARGET === "sg";
}

/** The Singapore database's URL: pooled for the app, direct for schema changes and the copy. */
export function singaporeDbUrl(direct: boolean): string | undefined {
  const p = SG_PREFIX;
  return direct
    ? firstSet([`${p}_URL_UNPOOLED`, `${p}_DATABASE_URL_UNPOOLED`, `${p}_POSTGRES_URL_NON_POOLING`])
    : firstSet([`${p}_POSTGRES_PRISMA_URL`, `${p}_URL`, `${p}_DATABASE_URL`, `${p}_POSTGRES_URL`]);
}

/** The URL the app connects with, or undefined for Prisma's default (DATABASE_URL). */
export function appDatabaseUrl(): string | undefined {
  if (!usesSingaporeDb()) return undefined;
  const url = singaporeDbUrl(false);
  if (!url) throw new Error("DB_TARGET=sg but no SGDB_* database URL is set.");
  return url;
}
