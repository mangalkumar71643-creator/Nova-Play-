import { PrismaClient } from "@prisma/client";

/**
 * One-time copy of every row from the old database to the new (Singapore)
 * one, run by the build (prisma/build.ts) with MIGRATE_DB_COPY=1 while the
 * app is in maintenance (MAINTENANCE=1), so nothing is written meanwhile.
 *
 * The new database must already have the schema (prisma db push) and be
 * completely empty — no rows and no trigger yet (seed.ts adds the trigger
 * after the copy; with it in place, copied transactions would change the
 * copied wallets again). Tables go parents first, by their foreign keys; a
 * table that points at itself (User.referrerId) gets those columns filled
 * in after all its rows are in. Every table's row count is compared at the
 * end, and any difference fails the build, so the app never goes live on a
 * partial copy.
 */
const BATCH = 2000;

type Db = PrismaClient;
const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tables(db: Db): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(
    `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows.map((r) => r.t);
}

async function count(db: Db, table: string): Promise<number> {
  const [r] = await db.$queryRawUnsafe<{ c: bigint }[]>(`SELECT count(*) AS c FROM ${q(table)}`);
  return Number(r.c);
}

/** Foreign keys as child -> parent, and each table's self-referencing columns. */
async function foreignKeys(db: Db) {
  const rows = await db.$queryRawUnsafe<{ child: string; parent: string; cols: string[] }[]>(`
    SELECT c.relname AS child, p.relname AS parent,
           array(SELECT a.attname::text FROM unnest(k.conkey) AS col(n) JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = col.n) AS cols
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_class p ON p.oid = k.confrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE k.contype = 'f' AND ns.nspname = 'public'`);
  return rows;
}

async function primaryKey(db: Db, table: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ col: string }[]>(
    `SELECT a.attname::text AS col FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    `public.${q(table)}`
  );
  return rows.map((r) => r.col);
}

function parentsFirst(all: string[], fks: { child: string; parent: string }[]): string[] {
  const done = new Set<string>();
  const order: string[] = [];
  const visit = (t: string, path: Set<string>) => {
    if (done.has(t)) return;
    if (path.has(t)) throw new Error(`Foreign keys loop through ${t}`);
    path.add(t);
    for (const fk of fks) if (fk.child === t && fk.parent !== t) visit(fk.parent, path);
    path.delete(t);
    done.add(t);
    order.push(t);
  };
  for (const t of all) visit(t, new Set());
  return order;
}

export async function copyDatabase(oldUrl: string, newUrl: string) {
  const from = new PrismaClient({ datasourceUrl: oldUrl });
  const to = new PrismaClient({ datasourceUrl: newUrl });
  try {
    const oldTables = await tables(from);
    const newTables = new Set(await tables(to));
    const missing = oldTables.filter((t) => !newTables.has(t));
    if (missing.length) throw new Error(`New database lacks tables: ${missing.join(", ")} (run prisma db push on it first)`);

    for (const t of oldTables) {
      if ((await count(to, t)) > 0) throw new Error(`New database is not empty (${t} has rows) — refusing to copy over it.`);
    }
    const [trig] = await to.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT count(*) AS c FROM pg_trigger WHERE NOT tgisinternal AND tgrelid = 'public."Transaction"'::regclass`
    );
    if (Number(trig.c) > 0) throw new Error("New database already has a trigger on Transaction — copy must run before seed.");

    const fks = await foreignKeys(from);
    const order = parentsFirst(oldTables, fks);
    console.log(`[copy] ${order.length} tables, parents first: ${order.join(", ")}`);

    for (const t of order) {
      const selfCols = fks.filter((fk) => fk.child === t && fk.parent === t).flatMap((fk) => fk.cols);
      const pk = selfCols.length ? await primaryKey(from, t) : [];
      if (selfCols.length && !pk.length) throw new Error(`${t} points at itself but has no primary key`);
      const total = await count(from, t);
      for (let offset = 0; offset < total; offset += BATCH) {
        const [{ j }] = await from.$queryRawUnsafe<{ j: string }[]>(
          `SELECT coalesce(json_agg(x), '[]'::json)::text AS j FROM (SELECT * FROM ${q(t)} ORDER BY ctid LIMIT ${BATCH} OFFSET ${offset}) x`
        );
        let rows = JSON.parse(j) as Record<string, unknown>[];
        if (selfCols.length) rows = rows.map((r) => ({ ...r, ...Object.fromEntries(selfCols.map((c) => [c, null])) }));
        await to.$executeRawUnsafe(`INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(null::${q(t)}, $1::json)`, JSON.stringify(rows));
      }
      // Now that every row of the table exists, put the self references back.
      if (selfCols.length) {
        for (let offset = 0; offset < total; offset += BATCH) {
          const [{ j }] = await from.$queryRawUnsafe<{ j: string }[]>(
            `SELECT coalesce(json_agg(x), '[]'::json)::text AS j FROM (SELECT ${[...pk, ...selfCols].map(q).join(", ")} FROM ${q(t)} ORDER BY ctid LIMIT ${BATCH} OFFSET ${offset}) x`
          );
          await to.$executeRawUnsafe(
            `UPDATE ${q(t)} AS t SET ${selfCols.map((c) => `${q(c)} = s.${q(c)}`).join(", ")}
             FROM json_populate_recordset(null::${q(t)}, $1::json) s
             WHERE ${pk.map((c) => `t.${q(c)} = s.${q(c)}`).join(" AND ")}`,
            j
          );
        }
      }
      console.log(`[copy] ${t}: ${total} row(s)`);
    }

    // Sequences (if any) continue after the copied values.
    const seqs = await to.$queryRawUnsafe<{ tbl: string; col: string; seq: string }[]>(`
      SELECT c.relname AS tbl, a.attname::text AS col, pg_get_serial_sequence(format('%I.%I', ns.nspname, c.relname), a.attname) AS seq
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND pg_get_serial_sequence(format('%I.%I', ns.nspname, c.relname), a.attname) IS NOT NULL`);
    for (const s of seqs) {
      await to.$executeRawUnsafe(`SELECT setval('${s.seq}', coalesce((SELECT max(${q(s.col)}) FROM ${q(s.tbl)}), 0) + 1, false)`);
    }

    // Every table must match exactly.
    const bad: string[] = [];
    for (const t of oldTables) {
      const [a, b] = [await count(from, t), await count(to, t)];
      if (a !== b) bad.push(`${t}: old ${a}, new ${b}`);
    }
    if (bad.length) throw new Error(`Row counts differ after the copy: ${bad.join("; ")}`);
    console.log(`[copy] done — all ${oldTables.length} tables match.`);
  } finally {
    await from.$disconnect();
    await to.$disconnect();
  }
}
