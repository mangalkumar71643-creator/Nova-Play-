import { execSync } from "child_process";
import { singaporeDbUrl, usesSingaporeDb } from "../src/db/databaseUrl";
import { copyDatabase } from "./copy-db";

/**
 * Vercel's build step (vercel.json buildCommand): bring the database the app
 * will use up to the schema and run seed.ts on it. With DB_TARGET=sg that is
 * the Singapore database; with MIGRATE_DB_COPY=1 as well, every row is first
 * copied over from the old one (copy-db.ts) — before the seed, which adds
 * the wallet trigger. Preview builds leave the database alone.
 */
async function main() {
  if (process.env.VERCEL_ENV === "preview") {
    console.log("Preview build: database left untouched");
    return;
  }
  const target = usesSingaporeDb() ? singaporeDbUrl(true) : process.env.DATABASE_URL;
  if (!target) throw new Error("No database URL for this build (DB_TARGET=sg needs the SGDB_* variables).");
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env: { ...process.env, DATABASE_URL: target } });

  console.log(`Database: ${usesSingaporeDb() ? "Singapore (SGDB)" : "DATABASE_URL"}`);
  run("npx prisma db push --skip-generate");
  if (process.env.MIGRATE_DB_COPY === "1") {
    if (!usesSingaporeDb()) throw new Error("MIGRATE_DB_COPY=1 needs DB_TARGET=sg.");
    const old = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    if (!old) throw new Error("No old DATABASE_URL to copy from.");
    await copyDatabase(old, target);
  }
  run("npx tsx prisma/seed.ts");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
