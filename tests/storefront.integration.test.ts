import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgBoss } from "pg-boss";
import { createDatabase } from "../src/db/client";
import { seedDemo } from "../src/db/seed";
import {
  labRuns,
  stores,
  orders,
  storefrontPurchases,
  submissionAttempts,
  simulatorRequests,
  simulatorReceipts,
} from "../src/db/schema";
import {
  createBoss,
  installQueue,
  SUBMISSION_QUEUE,
  RECOVERY_QUEUE,
  SCAN_QUEUE,
} from "../src/queue/boss";
import { createRun } from "../src/lab/create-run";
import { readStoreOrder } from "../src/store/read-order";
import { createSimulator } from "../src/simulator/server";
import { submitToSimulator, lookupSimulator } from "../src/simulator/connector";
import { processRun } from "../src/worker/process-run";
import { processRecovery } from "../src/recovery/process";
import { readRuns, readRun } from "../src/lab/read-runs";
import { testDatabaseUrl } from "./test-database";
const url = testDatabaseUrl();
const resources = createDatabase(url);
const { db, pool } = resources;
const boss = createBoss(url);
const token = "storefront-integration-test-only-token";
const simulator = createSimulator(db, token, 1500);
let baseUrl: string;
const cart = [
  { productId: "ridge-pack", quantity: 2 },
  { productId: "daily-bottle", quantity: 1 },
];
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await installQueue(url);
  await boss.start();
  await new Promise<void>((resolve) =>
    simulator.listen(0, "127.0.0.1", resolve),
  );
  const addr = simulator.address();
  if (!addr || typeof addr === "string") throw Error("No address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});
beforeEach(async () => {
  for (const queue of [SUBMISSION_QUEUE, RECOVERY_QUEUE, SCAN_QUEUE])
    await boss.deleteAllJobs(queue);
  await db.execute(
    sql`TRUNCATE TABLE storefront_purchases, simulator_requests, submission_attempts, lab_runs, simulator_receipts, audit_events, exceptions, fulfillment_intents, orders, stores`,
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
async function step(id: string) {
  const [row] = await db.select().from(labRuns).where(eq(labRuns.id, id));
  await db
    .update(labRuns)
    .set({ nextActionAt: new Date(0) })
    .where(eq(labRuns.id, id));
  await processRecovery(
    resources,
    boss,
    { runId: id, actionId: row.pendingActionId! },
    connectors,
  );
}
describe.sequential("connected storefront", () => {
  it("atomically creates a priced purchase, order, audit and submission job", async () => {
    const input = { requestId: crypto.randomUUID(), scenario: "accepted" };
    await createRun(db, boss, input, cart);
    const order = await readStoreOrder(db, input.requestId);
    expect(order).toMatchObject({
      number: `NL-${input.requestId.slice(0, 8).toUpperCase()}`,
      totalMinor: 29000,
      status: "placed",
    });
    expect(order!.items).toHaveLength(2);
    expect(await db.select().from(orders)).toHaveLength(11);
    expect(await db.select().from(storefrontPurchases)).toHaveLength(1);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(1);
    expect((await readRuns(db))[0].events[0].title).toBe(
      "Storefront demo checkout completed",
    );
  });
  it("coalesces concurrent and reordered-cart checkout retries", async () => {
    const input = { requestId: crypto.randomUUID(), scenario: "accepted" };
    const results = await Promise.all([
      createRun(db, boss, input, cart),
      createRun(db, boss, input, [...cart].reverse()),
    ]);
    expect(results.map((r) => r.duplicate).sort()).toEqual([false, true]);
    expect(await db.select().from(storefrontPurchases)).toHaveLength(1);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(1);
  });
  it("rejects reuse with changed quantities or scenario", async () => {
    const input = { requestId: crypto.randomUUID(), scenario: "accepted" };
    await createRun(db, boss, input, cart);
    await expect(
      createRun(db, boss, input, [{ productId: "ridge-pack", quantity: 1 }]),
    ).rejects.toThrow("another scenario or cart");
    await expect(
      createRun(db, boss, { ...input, scenario: "unavailable" }, cart),
    ).rejects.toThrow("another scenario or cart");
    expect(await db.select().from(storefrontPurchases)).toHaveLength(1);
  });
  it("does not let lab and storefront identities impersonate each other", async () => {
    const lab = { requestId: crypto.randomUUID(), scenario: "accepted" };
    await createRun(db, boss, lab);
    await expect(createRun(db, boss, lab, cart)).rejects.toThrow(
      "another scenario or cart",
    );
    const shop = { requestId: crypto.randomUUID(), scenario: "accepted" };
    await createRun(db, boss, shop, cart);
    await expect(createRun(db, boss, shop)).rejects.toThrow(
      "another scenario or cart",
    );
    expect(await readStoreOrder(db, lab.requestId)).toBeNull();
  });
  it("rolls back purchase and order even after a queue insert", async () => {
    const broken = {
      send: async (...args: Parameters<PgBoss["send"]>) => {
        await boss.send(...args);
        throw Error("Injected enqueue failure");
      },
    } as unknown as PgBoss;
    await expect(
      createRun(
        db,
        broken,
        { requestId: crypto.randomUUID(), scenario: "accepted" },
        cart,
      ),
    ).rejects.toThrow("Injected");
    expect(await db.select().from(storefrontPurchases)).toHaveLength(0);
    expect(await db.select().from(labRuns)).toHaveLength(0);
    expect(await db.select().from(orders)).toHaveLength(10);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(0);
  });
  it("rejects unknown products before writing an order", async () => {
    await expect(
      createRun(
        db,
        boss,
        { requestId: crypto.randomUUID(), scenario: "accepted" },
        [{ productId: "missing", quantity: 1 }],
      ),
    ).rejects.toThrow();
    expect(await db.select().from(orders)).toHaveLength(10);
  });
  it("recovers a checkout timeout by original reference with one physical POST", async () => {
    const { runId } = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "accepted_timeout" },
      cart,
    );
    await processRun(resources, runId, connectors.submit, boss);
    expect((await readStoreOrder(db, runId))!.status).toBe("confirming");
    await step(runId);
    expect(await readStoreOrder(db, runId)).toMatchObject({
      status: "acknowledged",
      totalMinor: 29000,
    });
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      1,
    );
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
    expect(await db.select().from(submissionAttempts)).toHaveLength(1);
  });
  it("retries a storefront outage without losing the priced purchase snapshot", async () => {
    const { runId } = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "temporary_outage" },
      cart,
    );
    const snapshot = (await readStoreOrder(db, runId))!.items;
    await processRun(resources, runId, connectors.submit, boss);
    await step(runId);
    await step(runId);
    expect(await readStoreOrder(db, runId)).toMatchObject({
      status: "acknowledged",
      totalMinor: 29000,
      items: snapshot,
    });
    expect((await db.select().from(simulatorRequests))[0].submissionCount).toBe(
      3,
    );
    expect(await db.select().from(simulatorReceipts)).toHaveLength(1);
  });
  it("projects rejected purchases as attention, not shipment or acceptance", async () => {
    const { runId } = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "address_rejected" },
      cart,
    );
    await processRun(resources, runId, connectors.submit, boss);
    const result = await readStoreOrder(db, runId);
    expect(result!.status).toBe("review");
    expect(result).not.toHaveProperty("customerEmail");
    expect(result).not.toHaveProperty("reviewReason");
    expect(result).not.toHaveProperty("scenario");
  });
  it("does not create another order when checkout is replayed after fulfillment acknowledgement", async () => {
    const input = { requestId: crypto.randomUUID(), scenario: "accepted" };
    await createRun(db, boss, input, cart);
    await processRun(resources, input.requestId, connectors.submit, boss);
    expect((await createRun(db, boss, input, cart)).duplicate).toBe(true);
    expect((await readStoreOrder(db, input.requestId))!.status).toBe(
      "acknowledged",
    );
    expect(await db.select().from(storefrontPurchases)).toHaveLength(1);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(1);
  });
  it("opens an exact order even after it leaves the latest-ten list", async () => {
    const original = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "accepted" },
      cart,
    );
    for (let i = 0; i < 11; i++)
      await createRun(db, boss, {
        requestId: crypto.randomUUID(),
        scenario: "accepted",
      });
    expect((await readRuns(db)).some((run) => run.id === original.runId)).toBe(
      false,
    );
    expect(await readRun(db, original.runId)).toMatchObject({
      id: original.runId,
      status: "queued",
      attemptCount: 0,
      recoveredByLookup: false,
    });
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(12);
  });
  it("exact reads do not mutate, submit, or append audit events", async () => {
    const { runId } = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "accepted" },
      cart,
    );
    const first = await readRun(db, runId);
    expect(await readRun(db, runId)).toEqual(first);
    expect(await db.select().from(submissionAttempts)).toHaveLength(0);
    expect(await db.select().from(simulatorRequests)).toHaveLength(0);
    expect(await boss.findJobs(SUBMISSION_QUEUE)).toHaveLength(1);
  });
  it("returns no evidence for absent or differently scoped runs", async () => {
    expect(await readRun(db, crypto.randomUUID())).toBeNull();
    const { runId } = await createRun(db, boss, {
      requestId: crypto.randomUUID(),
      scenario: "accepted",
    });
    const [other] = await db
      .insert(stores)
      .values({
        slug: "other-demo",
        name: "Other synthetic store",
        datasetVersion: "test",
        snapshotAt: new Date(),
      })
      .returning();
    await db
      .update(labRuns)
      .set({ storeId: other.id })
      .where(eq(labRuns.id, runId));
    expect(await readRun(db, runId)).toBeNull();
  });
  it("rejects malformed exact identities", async () => {
    await expect(readRun(db, "not-a-uuid")).rejects.toThrow();
  });
  it("projects a saved lookup recovery only after the audit confirms it", async () => {
    const { runId } = await createRun(
      db,
      boss,
      { requestId: crypto.randomUUID(), scenario: "accepted_timeout" },
      cart,
    );
    await processRun(resources, runId, connectors.submit, boss);
    expect((await readRun(db, runId))!.recoveredByLookup).toBe(false);
    await step(runId);
    expect(await readRun(db, runId)).toMatchObject({
      status: "accepted",
      recoveredByLookup: true,
      attemptCount: 1,
      lookupCount: 1,
    });
  });
});
