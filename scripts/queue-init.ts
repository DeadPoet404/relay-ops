import "./env";
import { installQueue } from "../src/queue/boss";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await installQueue(process.env.DATABASE_URL);
  console.log("Submission queue installed. No worker has been started.");
}
main().catch(() => {
  console.error(
    "Queue setup failed. Check DATABASE_URL, PostgreSQL, and schema permissions.",
  );
  process.exitCode = 1;
});
