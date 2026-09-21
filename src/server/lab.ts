import "server-only";
import { createBoss } from "../queue/boss";
import type { PgBoss } from "pg-boss";
const cache = globalThis as unknown as { relayBoss?: Promise<PgBoss> };
export function getLabBoss() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  if (!cache.relayBoss) {
    const boss = createBoss(process.env.DATABASE_URL);
    cache.relayBoss = boss
      .start()
      .then(() => boss)
      .catch(async () => {
        cache.relayBoss = undefined;
        await boss.stop();
        throw new Error("Queue unavailable");
      });
  }
  return cache.relayBoss;
}
