import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../src/db/client";
import { seedDemo, DEMO_SLUG, SNAPSHOT_AT } from "../src/db/seed";
import { readConsole } from "../src/db/read-console";
import {
  applyFulfillmentEvent,
  VersionConflictError,
} from "../src/db/apply-event";
import {
  auditEvents,
  exceptions,
  fulfillmentIntents,
  orders,
  stores,
} from "../src/db/schema";

import { testDatabaseUrl } from "./test-database";
const testUrl = testDatabaseUrl();

const { db, pool } = createDatabase(testUrl);

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.query(
    `CREATE OR REPLACE FUNCTION relay_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.actor = 'force-audit-failure' THEN RAISE EXCEPTION 'Deliberate integration-test failure'; END IF; RETURN NEW; END; $$`,
  );
  await pool.query(
    `DROP TRIGGER IF EXISTS relay_test_reject_audit ON audit_events`,
  );
  await pool.query(
    `CREATE TRIGGER relay_test_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION relay_test_reject_audit()`,
  );
});
beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE submission_attempts, lab_runs, simulator_receipts, audit_events, exceptions, fulfillment_intents, orders, stores`,
  );
  await seedDemo(db);
});
afterAll(async () => {
  await pool.query(
    "DROP TRIGGER IF EXISTS relay_test_reject_audit ON audit_events",
  );
  await pool.query("DROP FUNCTION IF EXISTS relay_test_reject_audit()");
  await pool.end();
});

async function target() {
  const [row] = await db
    .select({ intent: fulfillmentIntents, order: orders })
    .from(fulfillmentIntents)
    .innerJoin(orders, eq(orders.id, fulfillmentIntents.orderId))
    .where(eq(orders.orderNumber, "10488"));
  return row;
}
async function confirmation(actor = "integration_test") {
  const { intent, order } = await target();
  return {
    storeId: order.storeId,
    intentId: intent.id,
    expectedVersion: 0,
    actor,
    occurredAt: new Date("2026-09-20T10:01:00Z"),
    event: {
      type: "acceptance_confirmed" as const,
      warehouseReference: "SIM-WH-10488",
      evidence: {
        reference: intent.externalReference,
        detail: "Simulated matching reference lookup.",
      },
    },
  };
}

describe.sequential("PostgreSQL persistence", () => {
  it("seeds once and preserves all record counts on rerun", async () => {
    expect((await seedDemo(db)).inserted).toBe(false);
    expect(await db.select().from(orders)).toHaveLength(10);
    expect(await db.select().from(fulfillmentIntents)).toHaveLength(10);
    expect(await db.select().from(exceptions)).toHaveLength(10);
    expect(await db.select().from(auditEvents)).toHaveLength(37);
  });
  it("reads the actual database dataset and currency precision", async () => {
    await db
      .update(orders)
      .set({ totalMinor: 14899 })
      .where(eq(orders.orderNumber, "10482"));
    const data = await readConsole(db);
    expect(data.source).toBe("database");
    expect(data.orders).toHaveLength(10);
    expect(
      data.orders.find((order) => order.orderNumber === "10482"),
    ).toMatchObject({
      amountCents: 14899,
      ageMinutes: 84,
      status: "needs_review",
    });
  });
  it("scopes reads to a store and handles a truly empty store", async () => {
    await db.insert(stores).values({
      slug: "empty-demo",
      name: "Empty store",
      snapshotAt: SNAPSHOT_AT,
      datasetVersion: "empty-v1",
    });
    expect((await readConsole(db, "empty-demo")).orders).toEqual([]);
    await expect(readConsole(db, "does-not-exist")).rejects.toThrow(
      "not seeded",
    );
  });
  it("rejects duplicate source orders, negative money, and invalid currencies", async () => {
    const [order] = await db.select().from(orders).limit(1);
    await expect(
      db.insert(orders).values({ ...order, id: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      db.update(orders).set({ totalMinor: -1 }).where(eq(orders.id, order.id)),
    ).rejects.toThrow();
    await expect(
      db.update(orders).set({ currency: "GHS" }).where(eq(orders.id, order.id)),
    ).rejects.toThrow();
  });
  it("enforces foreign keys and acknowledgement evidence", async () => {
    const { intent } = await target();
    await expect(
      db
        .update(fulfillmentIntents)
        .set({ orderId: crypto.randomUUID() })
        .where(eq(fulfillmentIntents.id, intent.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(fulfillmentIntents)
        .set({ state: "acknowledged", warehouseReference: null })
        .where(eq(fulfillmentIntents.id, intent.id)),
    ).rejects.toThrow();
  });
  it("enforces resolution timestamps", async () => {
    const [exception] = await db
      .select()
      .from(exceptions)
      .where(eq(exceptions.status, "needs_review"))
      .limit(1);
    await expect(
      db
        .update(exceptions)
        .set({ status: "resolved", resolvedAt: null })
        .where(eq(exceptions.id, exception.id)),
    ).rejects.toThrow();
  });
  it("rejects updates and deletes of audit history", async () => {
    const [event] = await db.select().from(auditEvents).limit(1);
    await expect(
      db
        .update(auditEvents)
        .set({ title: "rewritten" })
        .where(eq(auditEvents.id, event.id)),
    ).rejects.toThrow();
    await expect(
      db.delete(auditEvents).where(eq(auditEvents.id, event.id)),
    ).rejects.toThrow();
  });
  it("commits state, exception resolution, and audit event atomically", async () => {
    const input = await confirmation();
    expect(await applyFulfillmentEvent(db, input)).toMatchObject({
      state: "acknowledged",
      version: 1,
    });
    const data = await readConsole(db);
    const order = data.orders.find((row) => row.orderNumber === "10488")!;
    expect(order.status).toBe("resolved");
    expect(order.events).toHaveLength(5);
    expect(order.events.at(-1)?.title).toBe("acceptance confirmed");
    expect(data.snapshotAt).toBe("2026-09-20T10:01:00.000Z");
    await seedDemo(db);
    expect((await target()).intent.version).toBe(1);
  });
  it("rolls back prior writes if audit insertion fails", async () => {
    await expect(
      applyFulfillmentEvent(db, await confirmation("force-audit-failure")),
    ).rejects.toThrow();
    expect((await target()).intent).toMatchObject({
      state: "acknowledgement_unknown",
      version: 0,
    });
    const data = await readConsole(db);
    expect(data.orders.find((row) => row.orderNumber === "10488")?.status).toBe(
      "investigating",
    );
    expect(await db.select().from(auditEvents)).toHaveLength(37);
  });
  it("permits only one concurrent writer with the same expected version", async () => {
    const input = await confirmation();
    const results = await Promise.allSettled([
      applyFulfillmentEvent(db, input),
      applyFulfillmentEvent(db, input),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const failure = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(VersionConflictError);
    expect(await db.select().from(auditEvents)).toHaveLength(38);
  });
  it("rejects cross-store writes and out-of-order events", async () => {
    const input = await confirmation();
    await expect(
      applyFulfillmentEvent(db, { ...input, storeId: crypto.randomUUID() }),
    ).rejects.toThrow("not found");
    await expect(
      applyFulfillmentEvent(db, {
        ...input,
        occurredAt: new Date("2026-09-19T10:00:00Z"),
      }),
    ).rejects.toThrow("Out-of-order");
    expect((await target()).intent.version).toBe(0);
  });
  it("does not silently overwrite an incompatible dataset", async () => {
    await db
      .update(stores)
      .set({ datasetVersion: "unknown-version" })
      .where(eq(stores.slug, DEMO_SLUG));
    await expect(seedDemo(db)).rejects.toThrow("version mismatch");
    expect(await db.select().from(orders)).toHaveLength(10);
  });
});
