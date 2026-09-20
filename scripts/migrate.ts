import "./env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/client";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env");
  const { db, pool } = createDatabase(process.env.DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Migration failed. Check DATABASE_URL, database availability, and migration compatibility. Credentials and driver details are intentionally not printed.",
  );
  process.exitCode = 1;
});
