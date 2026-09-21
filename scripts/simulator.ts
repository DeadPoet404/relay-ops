import "./env";
import { createDatabase } from "../src/db/client";
import { simulatorConfig } from "../src/lab/config";
import { createSimulator } from "../src/simulator/server";

async function main() {
  const config = simulatorConfig();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const resources = createDatabase(process.env.DATABASE_URL);
  const server = createSimulator(resources.db, config.token);
  const port = Number(new URL(config.url).port || 80);
  server.on("error", () => {
    console.error("Simulator could not listen. Check its local port.");
    void resources.pool.end();
    process.exitCode = 1;
  });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => {
      void resources.pool.end();
    });
    server.closeAllConnections();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  // Simulator is intentionally loopback-only and is never proxied by the browser.
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Warehouse simulator ready on 127.0.0.1:${port}. Synthetic submissions only.`,
    ),
  );
}
main().catch(() => {
  console.error(
    "Simulator unavailable. Check database and local demo configuration.",
  );
  process.exitCode = 1;
});
