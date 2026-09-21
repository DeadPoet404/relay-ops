import "./env";
import { z } from "zod";
import { createDatabase } from "../src/db/client";
import { simulatorConfig } from "../src/lab/config";
import {
  createBoss,
  SUBMISSION_QUEUE,
  RECOVERY_QUEUE,
  SCAN_QUEUE,
} from "../src/queue/boss";
import { lookupSimulator, submitToSimulator } from "../src/simulator/connector";
import { processRun } from "../src/worker/process-run";

import {
  processRecovery,
  reconcileScan,
  recoveryJobSchema,
} from "../src/recovery/process";

async function main() {
  const config = simulatorConfig();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const resources = createDatabase(process.env.DATABASE_URL);
  const boss = createBoss(process.env.DATABASE_URL, "worker");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log(
      "Worker stopping; waiting for active submission, lookup, and scan jobs.",
    );
    await boss.stop({ graceful: true, timeout: 10000 });
    await resources.pool.end();
  };
  try {
    await boss.start();
    await boss.work<{ runId: string }>(
      SUBMISSION_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        const { runId } = z
          .object({ runId: z.uuid() })
          .strict()
          .parse(job.data);
        await processRun(
          resources,
          runId,
          (request) => submitToSimulator(config.url, config.token, request),
          boss,
        );
        console.log(`Recorded outcome for demo run ${runId}`);
      },
    );
    await boss.work(
      RECOVERY_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        await processRecovery(
          resources,
          boss,
          recoveryJobSchema.parse(job.data),
          {
            submit: (request) =>
              submitToSimulator(config.url, config.token, request),
            lookup: (reference) =>
              lookupSimulator(config.url, config.token, reference),
          },
        );
      },
    );
    await boss.work(
      SCAN_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async () => {
        await reconcileScan(resources, boss);
      },
    );
    await boss.send(
      SCAN_QUEUE,
      {},
      { singletonKey: "startup", singletonSeconds: 30 },
    );
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
    console.log(
      "Relay worker ready. Bounded retries, reference lookups, and periodic reconciliation are enabled for the local simulator.",
    );
  } catch {
    await stop();
    throw new Error("Worker startup failed");
  }
}
main().catch(() => {
  console.error(
    "Worker unavailable. Check database, queue:init, demo flags, and simulator configuration.",
  );
  process.exitCode = 1;
});
