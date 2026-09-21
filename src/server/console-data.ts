import "server-only";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { demoEnabled } from "../lab/config";
import { readConsole } from "../db/read-console";
import { fixtureConsoleData, type ConsoleData } from "../lib/console-data";

// Reuse a bounded pool across development hot reloads. No client-side credentials.
const globalDatabase = globalThis as unknown as {
  relayDatabase?: ReturnType<typeof createDatabase>;
};
export function getDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Database source requires DATABASE_URL");
  globalDatabase.relayDatabase ??= createDatabase(url);
  return globalDatabase.relayDatabase;
}

export async function loadConsoleData(): Promise<ConsoleData> {
  const source = z
    .enum(["fixtures", "database"])
    .parse(process.env.RELAY_DATA_SOURCE ?? "fixtures");
  if (source === "fixtures") return fixtureConsoleData();
  return {
    ...(await readConsole(getDatabase().db)),
    labEnabled: demoEnabled(),
  };
}
