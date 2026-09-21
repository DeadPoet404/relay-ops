import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";

async function optionalFile(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
async function main() {
  let local = await optionalFile(".env.local");
  const existing = { ...parse(await optionalFile(".env")), ...parse(local) };
  const settings: Record<string, string> = {
    RELAY_ENABLE_DEMO_RUNS: "true",
    RELAY_DATA_SOURCE: "database",
    RELAY_DEMO_ORIGIN: existing.RELAY_DEMO_ORIGIN || "http://localhost:3000",
    RELAY_SIMULATOR_URL:
      existing.RELAY_SIMULATOR_URL || "http://127.0.0.1:4010",
    RELAY_SIMULATOR_TOKEN:
      existing.RELAY_SIMULATOR_TOKEN?.length >= 32
        ? existing.RELAY_SIMULATOR_TOKEN
        : randomBytes(32).toString("hex"),
  };
  for (const [key, value] of Object.entries(settings)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    local = pattern.test(local)
      ? local.replace(pattern, () => line)
      : `${local.trimEnd()}\n${line}\n`;
  }
  await writeFile(".env.local", local, { mode: 0o600 });
  console.log(
    "Local demo enabled in ignored .env.local. Simulator secret retained/generated without printing it. Database settings were not changed. Start the UI with npm run demo:dev (loopback-only). Restart processes after environment changes.",
  );
}
main().catch(() => {
  console.error(
    "Could not configure the local demo; no credentials were printed.",
  );
  process.exitCode = 1;
});
