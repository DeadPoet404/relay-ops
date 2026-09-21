import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import { createDatabase } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import {
  labRuns,
  orders,
  simulatorReceipts,
  simulatorRequests,
  submissionAttempts,
} from "../src/db/schema";
import {
  createBoss,
  installQueue,
  SUBMISSION_QUEUE,
  RECOVERY_QUEUE,
  SCAN_QUEUE,
} from "../src/queue/boss";
import { createRun } from "../src/lab/create-run";
import { readRuns } from "../src/lab/read-runs";
import { createSimulator } from "../src/simulator/server";
import { submitToSimulator } from "../src/simulator/connector";
import { processRun } from "../src/worker/process-run";
import { readConsole } from "../src/db/read-console";
import { testDatabaseUrl } from "./test-database";

const url = testDatabaseUrl();
const resources = createDatabase(url);
const { db, pool } = resources;
const boss = createBoss(url);
const token = "integration-test-secret-not-for-deployment";
const simulator = createSimulator(db, token, 4000);
let baseUrl: string;
const children = new Set<ChildProcess>();
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await installQueue(url);
  await boss.start();
  await new Promise<void>((resolve) =>
    simulator.listen(0, "127.0.0.1", resolve),
  );
  const address = simulator.address();
  if (!address || typeof address === "string")
    throw new Error("No simulator address");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  for (const queue of [SUBMISSION_QUEUE, RECOVERY_QUEUE, SCAN_QUEUE])
    await boss.deleteAllJobs(queue);
  await db.execute(
    sql`TRUNCATE TABLE simulator_requests, submission_attempts, lab_runs, simulator_receipts, audit_events, exceptions, fulfillment_intents, orders, stores`,
  );
  await seedDemo(db);
});
async function stopChild(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
) {
  if (child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  const closed = once(child, "exit");
  child.kill(signal);
  await closed;
  children.delete(child);
}
afterAll(async () => {
  for (const child of children) await stopChild(child, "SIGKILL");
  simulator.closeAllConnections();
  await new Promise<void>((resolve) => simulator.close(() => resolve()));
  await boss.stop();
  await pool.end();
});
const submit = (request: Parameters<typeof submitToSimulator>[2]) =>
  submitToSimulator(baseUrl, token, request, 200);
async function run(
  scenario:
    | "accepted"
    | "address_rejected"
    | "unavailable"
    | "accepted_timeout",
) {
  return createRun(db, boss, { requestId: crypto.randomUUID(), scenario });
}
async function status(id: string) {
  return (await db.select().from(labRuns).where(eq(labRuns.id, id)))[0].status;
}
async function worker() {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/worker.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        DATABASE_URL: url,
        RELAY_DATA_SOURCE: "database",
        RELAY_ENABLE_DEMO_RUNS: "true",
        RELAY_SIMULATOR_URL: baseUrl,
        RELAY_SIMULATOR_TOKEN: token,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.add(child);
  let output = "";
  child.stdout!.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr!.on("data", (chunk) => {
    output += chunk.toString();
  });
  await vi.waitFor(
    () => {
      if (child.exitCode !== null)
        throw new Error("Worker exited before ready");
      expect(output).toContain("Relay worker ready");
    },
    { timeout: 10000, interval: 50 },
  );
  return child;
}

describe.sequential("durable local execution", () => {
  it("commits one order and one job, even for concurrent duplicate creation requests", async () => {
    const request = { requestId: crypto.randomUUID(), scenario: "accepted" };
    const results = await Promise.all([
      createRun(db, boss, request),
      createRun(db, boss, request),
    ]);
    expect(results.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(await db.select().from(orders)).toHaveLength(11);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(1);
    await expect(
      createRun(db, boss, { ...request, scenario: "unavailable" }),
    ).rejects.toThrow("another scenario");
  });
  it("rolls back both the queued job and application records if the transaction fails", async () => {
    const failingBoss = {
      send: async (...args: Parameters<PgBoss["send"]>) => {
        await boss.send(...args);
        throw new Error("Failure after queue SQL insert");
      },
    } as unknown as PgBoss;
    await expect(
      createRun(db, failingBoss, {
        requestId: crypto.randomUUID(),
        scenario: "accepted",
      }),
    ).rejects.toThrow("after queue");
    expect(await db.select().from(orders)).toHaveLength(10);
    expect(await db.select().from(labRuns)).toHaveLength(0);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(0);
  });
  it("records a normal acknowledgement without creating an exception", async () => {
    const { runId } = await run("accepted");
    await processRun(resources, runId, submit, boss);
    expect(await status(runId)).toBe("accepted");
    expect((await readConsole(db)).orders).toHaveLength(10);
    expect((await readRuns(db))[0]).toMatchObject({
      status: "accepted",
      attemptCount: 1,
    });
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
  });
  it("records a rejection and a review item without retrying", async () => {
    const { runId } = await run("address_rejected");
    await processRun(resources, runId, submit, boss);
    expect(await status(runId)).toBe("rejected");
    const data = await readConsole(db);
    expect(data.orders.find((o) => o.reference.endsWith(runId))).toMatchObject({
      kind: "address_rejected",
      status: "needs_review",
    });
    expect(await db.select().from(simulatorReceipts)).toHaveLength(0);
  });
  it("records a confirmed 503 and schedules a bounded safe retry", async () => {
    const { runId } = await run("unavailable");
    await processRun(resources, runId, submit, boss);
    expect(await status(runId)).toBe("unavailable");
    expect(
      (await readConsole(db)).orders.find((o) => o.reference.endsWith(runId)),
    ).toMatchObject({
      kind: "warehouse_unavailable",
      status: "retry_scheduled",
    });
    expect(await db.select().from(simulatorReceipts)).toHaveLength(0);
  });
  it("keeps accepted-but-timed-out submissions unknown to Relay, with one provider receipt", async () => {
    const { runId } = await run("accepted_timeout");
    await processRun(resources, runId, submit, boss);
    expect(await status(runId)).toBe("unknown");
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    expect((await readRuns(db))[0].warehouseReference).toBeNull();
  });
  it("does not issue a second HTTP submission when a terminal job is delivered again", async () => {
    const { runId } = await run("accepted_timeout");
    const connector = vi.fn(submit);
    await processRun(resources, runId, connector, boss);
    await processRun(resources, runId, connector, boss);
    expect(connector).toHaveBeenCalledTimes(1);
    expect(await db.select().from(submissionAttempts)).toHaveLength(1);
  });
  it("serializes concurrent deliveries of the same run", async () => {
    const { runId } = await run("accepted");
    const connector = vi.fn(submit);
    const results = await Promise.allSettled([
      processRun(resources, runId, connector, boss),
      processRun(resources, runId, connector, boss),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(connector).toHaveBeenCalledTimes(1);
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
  });
  it("holds an interrupted persisted claim without making a fresh warehouse request", async () => {
    const { runId } = await run("accepted");
    const connector = vi.fn(submit);
    await expect(
      processRun(resources, runId, connector, boss, {
        afterClaim: async () => {
          throw new Error("Simulated process interruption");
        },
      }),
    ).rejects.toThrow("interruption");
    expect(await status(runId)).toBe("running");
    await processRun(resources, runId, connector, boss);
    expect(await status(runId)).toBe("unknown");
    expect(connector).not.toHaveBeenCalled();
    expect(
      (await readRuns(db))[0].events.some((event) =>
        event.title.includes("Interrupted submission"),
      ),
    ).toBe(true);
  });
  it("requires simulator authentication, rejects malformed input, and deduplicates accepted references", async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(401);
    const reference = `relay-lab-${crypto.randomUUID()}`;
    const data = {
      reference,
      amountMinor: 12900,
      currency: "USD" as const,
      scenario: "accepted" as const,
    };
    const first = await submit(data);
    const second = await submit(data);
    expect(first.kind).toBe("accepted");
    expect(second).toEqual(first);
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    expect(
      (
        await fetch(`${baseUrl}/fulfillments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...data, amountMinor: 99 }),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await fetch(`${baseUrl}/fulfillments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: "{",
        })
      ).status,
    ).toBe(400);
  });
  it("processes persisted queued work after a real worker process stops and restarts", async () => {
    const firstWorker = await worker();
    await stopChild(firstWorker);
    const { runId } = await run("accepted");
    expect(await status(runId)).toBe("queued");
    const secondWorker = await worker();
    try {
      await vi.waitFor(
        async () => expect(await status(runId)).toBe("accepted"),
        { timeout: 12000, interval: 50 },
      );
      await vi.waitFor(
        async () =>
          expect(
            (await boss.findJobs(SUBMISSION_QUEUE, { id: runId }))[0].state,
          ).toBe("completed"),
        { timeout: 5000, interval: 50 },
      );
      expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    } finally {
      await stopChild(secondWorker);
    }
  }, 30000);
  it("recovers an expired active job after SIGKILL without resubmitting the accepted order", async () => {
    await boss.updateQueue(SUBMISSION_QUEUE, { expireInSeconds: 1 });
    const firstWorker = await worker();
    const { runId } = await run("accepted_timeout");
    try {
      await vi.waitFor(
        async () =>
          expect(await db.select().from(simulatorReceipts)).toHaveLength(1),
        { timeout: 10000, interval: 20 },
      );
      await stopChild(firstWorker, "SIGKILL");
      expect(await status(runId)).toBe("running");
      const secondWorker = await worker();
      try {
        await vi.waitFor(
          async () => expect(await status(runId)).toBe("accepted"),
          { timeout: 22000, interval: 100 },
        );
        expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
        expect(await db.select().from(submissionAttempts)).toHaveLength(1);
      } finally {
        await stopChild(secondWorker);
      }
    } finally {
      await stopChild(firstWorker, "SIGKILL");
      await boss.updateQueue(SUBMISSION_QUEUE, { expireInSeconds: 20 });
    }
  }, 40000);
  it("retains delayed business retries across an actual worker restart", async () => {
    const { runId } = await createRun(db, boss, {
      requestId: crypto.randomUUID(),
      scenario: "temporary_outage",
    });
    await processRun(resources, runId, submit, boss);
    const [scheduled] = await db
      .select()
      .from(labRuns)
      .where(eq(labRuns.id, runId));
    expect(scheduled.pendingAction).toBe("retry");
    expect(scheduled.nextActionAt!.getTime()).toBeGreaterThan(Date.now());
    const first = await worker();
    await stopChild(first);
    const restarted = await worker();
    try {
      await vi.waitFor(
        async () => expect(await status(runId)).toBe("accepted"),
        { timeout: 20000, interval: 100 },
      );
      expect(await db.select().from(submissionAttempts)).toHaveLength(3);
      expect(
        (await db.select().from(simulatorRequests))[0].submissionCount,
      ).toBe(3);
      expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    } finally {
      await stopChild(restarted);
    }
  });
});
