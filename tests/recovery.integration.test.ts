import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgBoss } from "pg-boss";
import { createDatabase } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import {
  labRuns,
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
import { createSimulator } from "../src/simulator/server";
import { submitToSimulator, lookupSimulator } from "../src/simulator/connector";
import { processRun } from "../src/worker/process-run";
import {
  processRecovery,
  reconcileScan,
  requestLookup,
} from "../src/recovery/process";
import { readRuns } from "../src/lab/read-runs";
import { readConsole } from "../src/db/read-console";
import { testDatabaseUrl } from "./test-database";
import type { Scenario } from "../src/lab/contracts";

const url = testDatabaseUrl();
const resources = createDatabase(url);
const { db, pool } = resources;
const boss = createBoss(url);
const token = "recovery-integration-test-only-token";
const simulator = createSimulator(db, token, 1500);
let baseUrl: string;
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await installQueue(url);
  await boss.start();
  await new Promise<void>((resolve) =>
    simulator.listen(0, "127.0.0.1", resolve),
  );
  const address = simulator.address();
  if (!address || typeof address === "string")
    throw new Error("No local address");
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
afterAll(async () => {
  simulator.closeAllConnections();
  await new Promise<void>((resolve) => simulator.close(() => resolve()));
  await boss.stop();
  await pool.end();
});
const connectors = {
  submit: (request: Parameters<typeof submitToSimulator>[2]) =>
    submitToSimulator(baseUrl, token, request, 150),
  lookup: (reference: string) =>
    lookupSimulator(baseUrl, token, reference, 200),
};
async function create(scenario: Scenario) {
  const { runId } = await createRun(db, boss, {
    requestId: crypto.randomUUID(),
    scenario,
  });
  return runId;
}
async function row(id: string) {
  return (await db.select().from(labRuns).where(eq(labRuns.id, id)))[0];
}
async function step(id: string) {
  const current = await row(id);
  if (!current.pendingActionId) throw new Error("No pending action");
  // Only tests make an action due immediately; the running worker uses persisted delays.
  await db
    .update(labRuns)
    .set({ nextActionAt: new Date(Date.now() - 1) })
    .where(eq(labRuns.id, id));
  await processRecovery(
    resources,
    boss,
    { runId: id, actionId: current.pendingActionId },
    connectors,
  );
  return current.pendingActionId;
}

describe.sequential("safe recovery and reconciliation", () => {
  it("resolves accepted-but-timed-out by lookup with one POST and one receipt", async () => {
    const id = await create("accepted_timeout");
    await processRun(resources, id, connectors.submit, boss);
    expect((await row(id)).status).toBe("unknown");
    await step(id);
    expect(await row(id)).toMatchObject({
      status: "accepted",
      lookupCount: 1,
      pendingActionId: null,
    });
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      1,
    );
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    expect(
      (await readConsole(db)).orders.find((o) => o.reference.endsWith(id))
        ?.status,
    ).toBe("resolved");
  });
  it("recovers a transient outage on attempt three using the unchanged reference", async () => {
    const id = await create("temporary_outage");
    await processRun(resources, id, connectors.submit, boss);
    expect((await row(id)).pendingAction).toBe("retry");
    await step(id);
    await step(id);
    expect((await row(id)).status).toBe("accepted");
    expect(await db.select().from(submissionAttempts)).toHaveLength(3);
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      3,
    );
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    expect((await readRuns(db))[0].attemptCount).toBe(3);
  });
  it("stops permanent unavailability at three total submissions and escalates", async () => {
    const id = await create("unavailable");
    await processRun(resources, id, connectors.submit, boss);
    await step(id);
    await step(id);
    expect(await row(id)).toMatchObject({
      pendingAction: null,
      status: "unavailable",
    });
    expect((await row(id)).reviewReason).toContain("budget exhausted");
    await reconcileScan(resources, boss);
    expect((await row(id)).pendingActionId).toBeNull();
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      3,
    );
    expect(
      (await readConsole(db)).orders.find((o) => o.reference.endsWith(id))
        ?.status,
    ).toBe("needs_review");
  });
  it("bounds failed lookups without issuing another POST", async () => {
    const id = await create("lookup_unavailable");
    await processRun(resources, id, connectors.submit, boss);
    await step(id);
    await step(id);
    await step(id);
    expect(await row(id)).toMatchObject({
      status: "unknown",
      lookupCount: 3,
      pendingAction: null,
    });
    expect((await row(id)).reviewReason).toContain("Three lookup");
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      1,
    );
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
  });
  it("does not resubmit after a lookup returns not found", async () => {
    const id = await create("accepted");
    await processRun(resources, id, async () => ({ kind: "unknown" }), boss);
    await step(id);
    expect((await row(id)).reviewReason).toContain("not found");
    expect(await db.select().from(simulatorRequests)).toHaveLength(0);
    expect(await db.select().from(submissionAttempts)).toHaveLength(1);
  });
  it("duplicate and stale retry deliveries cannot add another attempt", async () => {
    const id = await create("temporary_outage");
    await processRun(resources, id, connectors.submit, boss);
    const firstAction = await step(id);
    await step(id);
    await processRecovery(
      resources,
      boss,
      { runId: id, actionId: firstAction },
      connectors,
    );
    await processRun(resources, id, connectors.submit, boss);
    expect(await db.select().from(submissionAttempts)).toHaveLength(3);
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      3,
    );
  });
  it("read-only operator requests coalesce and cannot bypass address review", async () => {
    const id = await create("accepted_timeout");
    await processRun(resources, id, connectors.submit, boss);
    const original = (await row(id)).pendingActionId;
    await requestLookup(resources, boss, id);
    await requestLookup(resources, boss, id);
    expect((await row(id)).pendingActionId).toBe(original);
    const rejected = await create("address_rejected");
    await processRun(resources, rejected, connectors.submit, boss);
    expect((await requestLookup(resources, boss, rejected)).scheduled).toBe(
      false,
    );
    expect((await row(rejected)).pendingActionId).toBeNull();
  });
  it("reconciliation re-arms overdue missing jobs and fences their stale IDs", async () => {
    const id = await create("accepted_timeout");
    await processRun(resources, id, connectors.submit, boss);
    const oldAction = (await row(id)).pendingActionId!;
    await boss.deleteJob(RECOVERY_QUEUE, oldAction);
    await db
      .update(labRuns)
      .set({ nextActionAt: new Date(Date.now() - 31000) })
      .where(eq(labRuns.id, id));
    await reconcileScan(resources, boss);
    expect((await row(id)).pendingActionId).not.toBe(oldAction);
    const lookup = vi.fn(connectors.lookup);
    await processRecovery(
      resources,
      boss,
      { runId: id, actionId: oldAction },
      { ...connectors, lookup },
    );
    expect(lookup).not.toHaveBeenCalled();
    await step(id);
    expect((await row(id)).status).toBe("accepted");
  });
  it("reconciliation discovers historical unresolved runs without submitting them", async () => {
    const id = await create("accepted_timeout");
    await processRun(resources, id, connectors.submit, boss);
    await db
      .update(labRuns)
      .set({ pendingAction: null, pendingActionId: null, nextActionAt: null })
      .where(eq(labRuns.id, id));
    await reconcileScan(resources, boss);
    await step(id);
    expect((await row(id)).status).toBe("accepted");
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      1,
    );
  });
  it("rolls back recovery metadata and audit if queue insertion fails", async () => {
    const id = await create("accepted_timeout");
    await processRun(resources, id, connectors.submit, boss);
    await db
      .update(labRuns)
      .set({ pendingAction: null, pendingActionId: null, nextActionAt: null })
      .where(eq(labRuns.id, id));
    const before = (await readRuns(db))[0].events.length;
    const broken = {
      send: async () => {
        throw new Error("Deliberate enqueue failure");
      },
    } as unknown as PgBoss;
    await expect(requestLookup(resources, broken, id)).rejects.toThrow(
      "enqueue failure",
    );
    expect((await row(id)).pendingActionId).toBeNull();
    expect((await readRuns(db))[0].events).toHaveLength(before);
  });
  it("has a durable minutely reconciliation schedule", async () => {
    const schedule = await boss.getSchedule(SCAN_QUEUE);
    expect(schedule).not.toBeNull();
    expect(schedule?.cron).toBe("* * * * *");
  });
  it("schema constraints reject partial actions and a fourth attempt", async () => {
    const id = await create("accepted");
    await expect(
      db
        .update(labRuns)
        .set({
          pendingAction: null,
          pendingActionId: crypto.randomUUID(),
          nextActionAt: new Date(),
        })
        .where(eq(labRuns.id, id)),
    ).rejects.toThrow();
    await expect(
      db.insert(submissionAttempts).values({
        runId: id,
        jobId: crypto.randomUUID(),
        attemptNumber: 4,
        startedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
  it("serializes concurrent retry deliveries and fences duplicate callbacks", async () => {
    const id = await create("temporary_outage");
    await processRun(resources, id, connectors.submit, boss);
    const actionId = (await row(id)).pendingActionId!;
    await db
      .update(labRuns)
      .set({ nextActionAt: new Date(0) })
      .where(eq(labRuns.id, id));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit = vi.fn(
      async (request: Parameters<typeof connectors.submit>[0]) => {
        await gate;
        return connectors.submit(request);
      },
    );
    const first = processRecovery(
      resources,
      boss,
      { runId: id, actionId },
      { ...connectors, submit },
    );
    try {
      await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
      await expect(
        processRecovery(resources, boss, { runId: id, actionId }, connectors),
      ).rejects.toThrow("Run is being handled");
      await reconcileScan(resources, boss);
      expect((await row(id)).status).toBe("running");
    } finally {
      release();
      await first;
    }
    await processRecovery(resources, boss, { runId: id, actionId }, connectors);
    expect(await db.select().from(submissionAttempts)).toHaveLength(2);
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      2,
    );
  });
  it("an old initial delivery cannot interrupt a newer retry claim", async () => {
    const id = await create("temporary_outage");
    await processRun(resources, id, connectors.submit, boss);
    const actionId = (await row(id)).pendingActionId!;
    await db
      .update(labRuns)
      .set({ nextActionAt: new Date(0) })
      .where(eq(labRuns.id, id));
    await expect(
      processRun(
        resources,
        id,
        connectors.submit,
        boss,
        {
          afterClaim: async () => {
            throw new Error("Crash after retry claim");
          },
        },
        actionId,
      ),
    ).rejects.toThrow("Crash after retry claim");
    await processRun(resources, id, connectors.submit, boss);
    expect((await row(id)).status).toBe("running");
    await processRecovery(resources, boss, { runId: id, actionId }, connectors);
    expect(await row(id)).toMatchObject({
      status: "unknown",
      pendingAction: "lookup",
    });
    await step(id);
    expect((await row(id)).reviewReason).toContain("not found");
    expect(await db.select().from(submissionAttempts)).toHaveLength(2);
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      1,
    );
  });
});
