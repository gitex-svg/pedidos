import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";

const migrationsFolder =
  process.env.MIGRATIONS_DIR?.trim() || path.resolve(process.cwd(), "drizzle");

try {
  await migrate(db, { migrationsFolder });
  process.stdout.write("Migrations aplicadas com sucesso.\n");
} finally {
  await pool.end();
}