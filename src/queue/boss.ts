import { PgBoss } from "pg-boss";

export const SUBMISSION_QUEUE = "relay-demo-submit";
export const RECOVERY_QUEUE = "relay-demo-recover";
export const SCAN_QUEUE = "relay-demo-reconcile-scan";
export function createBoss(
  url: string,
  mode: "install" | "producer" | "worker" = "producer",
) {
  const boss = new PgBoss({
    connectionString: url,
    schema: "relay_jobs",
    max: 3,
    connectionTimeoutMillis: 5000,
    migrate: mode === "install",
    createSchema: mode === "install",
    supervise: mode === "worker",
    schedule: mode === "worker",
    cronWorkerIntervalSeconds: 1,
    cronMonitorIntervalSeconds: 1,
    superviseIntervalSeconds: 5,
  });
  boss.on("error", () =>
    console.error(
      "Relay queue error. Check database availability and queue installation.",
    ),
  );
  boss.on("warning", () =>
    console.warn(
      "Relay queue warning; inspect queue state and worker configuration.",
    ),
  );
  return boss;
}
export async function installQueue(url: string) {
  const boss = createBoss(url, "install");
  try {
    await boss.start();
    for (const name of [SUBMISSION_QUEUE, RECOVERY_QUEUE, SCAN_QUEUE]) {
      await boss.createQueue(name, {
        retryLimit: 3,
        retryDelay: 2,
        retryBackoff: false,
        expireInSeconds: 20,
        retentionSeconds: 604800,
        deleteAfterSeconds: 86400,
      });
    }
    await boss.schedule(SCAN_QUEUE, "* * * * *", {});
  } finally {
    await boss.stop();
  }
}
