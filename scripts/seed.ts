import "./env";
import { createDatabase } from "../src/db/client";
import { seedDemo } from "../src/db/seed";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env");
  const { db, pool } = createDatabase(process.env.DATABASE_URL);
  try {
    const result = await seedDemo(db);
    console.log(
      result.inserted
        ? "Seeded Northline demo: 10 orders, 10 intents, 10 exceptions, 37 audit events."
        : "Northline demo already exists. No records were overwritten.",
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    "Seed failed. Check configuration, apply migrations, and verify dataset compatibility. No partial seed was committed.",
  );
  process.exitCode = 1;
});
