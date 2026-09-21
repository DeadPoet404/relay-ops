import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
// Opt-in, non-destructive local browser check: creates SIX persisted demo orders.
if (process.env.RELAY_BROWSER_TESTS !== "true") {
  console.error(
    "Run with RELAY_BROWSER_TESTS=true only against your local synthetic lab. This creates six orders and requires the dev app, simulator, and worker.",
  );
  process.exit(1);
}
fs.mkdirSync("test-results/storefront", { recursive: true });
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:3000/store", {
      waitUntil: "networkidle",
    });
    await expect(page.locator(".nl-product")).toHaveCount(4);
    await page.screenshot({
      path: "test-results/storefront/desktop.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Accessories", exact: true })
      .click();
    await expect(page.locator(".nl-product")).toHaveCount(2);
    await page
      .getByRole("button", { name: "All essentials", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "test-results/storefront/mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    let latest;
    for (const [scenario, label, outcome, submits, lookups] of [
      [
        "accepted_timeout",
        "Accepted, response lost",
        "Warehouse acknowledged",
        1,
        1,
      ],
      [
        "temporary_outage",
        "Transient outage, then recovery",
        "Warehouse acknowledged",
        3,
        0,
      ],
      ["unavailable", "Warehouse unavailable", "Needs attention", 3, 0],
      [
        "lookup_unavailable",
        "Status lookup unavailable",
        "Needs attention",
        1,
        3,
      ],
      ["address_rejected", "Address rejected", "Needs attention", 1, 0],
      ["accepted", "Normal acceptance", "Warehouse acknowledged", 1, 0],
    ]) {
      await page.goto("http://localhost:3000/presenter");
      await page.getByRole("button", { name: label, exact: false }).click();
      await page
        .getByRole("link", { name: "Open Northline Supply", exact: false })
        .click();
      await page
        .getByRole("link", { name: "View Ridge Daypack", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Ridge Daypack", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Add to bag", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      if (scenario === "accepted_timeout") {
        await page
          .getByRole("button", { name: "Add one Ridge Daypack" })
          .click();
        await expect(
          page.getByRole("dialog").locator(".nl-total"),
        ).toContainText("$258");
        await page
          .getByRole("button", { name: "Remove one Ridge Daypack" })
          .click();
      }
      await page
        .getByRole("link", { name: "Continue to demo checkout", exact: false })
        .click();
      await expect(
        page.getByRole("button", { name: "Place demo order", exact: true }),
      ).toBeDisabled();
      await page.getByRole("checkbox").check();
      if (scenario === "accepted_timeout") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: "test-results/storefront/checkout.png",
          fullPage: true,
        });
        let original;
        await page.route(
          "**/api/store/checkout",
          async (route) => {
            const response = await route.fetch();
            original = (await response.json()).runId;
            await route.abort("failed");
          },
          { times: 1 },
        );
        await page
          .getByRole("button", { name: "Place demo order", exact: true })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Retry same demo checkout",
            exact: true,
          }),
        ).toBeEnabled({ timeout: 25000 });
        await page.reload();
        await expect(
          page.getByRole("button", {
            name: "Retry same demo checkout",
            exact: true,
          }),
        ).toBeDisabled();
        await page.getByRole("checkbox").check();
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/store/checkout") &&
            r.request().method() === "POST",
        );
        await page
          .getByRole("button", {
            name: "Retry same demo checkout",
            exact: true,
          })
          .click();
        const r = await response;
        expect(r.status()).toBe(200);
        const data = await r.json();
        expect(data.runId).toBe(original);
        expect(data.duplicate).toBe(true);
        latest = original;
      } else {
        const response = page.waitForResponse(
          (r) =>
            r.url().endsWith("/api/store/checkout") &&
            r.request().method() === "POST",
        );
        await page
          .getByRole("button", { name: "Place demo order", exact: true })
          .click();
        const r = await response;
        expect(r.status()).toBe(201);
        latest = (await r.json()).runId;
      }
      await page.waitForURL("**/store/orders/*");
      await expect(page.locator(".nl-status-pill")).toHaveText(outcome, {
        timeout: 35000,
      });
      const lab = await page.request.get("http://localhost:3000/api/lab");
      const row = (await lab.json()).runs.find((r) => r.id === latest);
      expect(row.attemptCount).toBe(submits);
      expect(row.lookupCount).toBe(lookups);
      expect(row.orderNumber.startsWith("NL-")).toBe(true);
      expect(
        await page.evaluate(() =>
          localStorage.getItem("northline.nextScenario"),
        ),
      ).toBeNull();
      if (scenario === "accepted_timeout") {
        await page.screenshot({
          path: "test-results/storefront/recovered.png",
          fullPage: true,
        });
        const old = await page.request.get(
          `http://localhost:3000/api/store/orders/${latest}`,
        );
        expect((await old.json()).order.totalMinor).toBe(12900);
      }
    }
    // Browser-facing boundaries: strict bodies, local origin, order identity, stale-read warning.
    const input = {
      requestId: crypto.randomUUID(),
      scenario: "accepted",
      items: [{ productId: "ridge-pack", quantity: 1 }],
      totalMinor: 1,
    };
    expect(
      (
        await page.request.post("http://localhost:3000/api/store/checkout", {
          headers: { Origin: "http://localhost:3000" },
          data: input,
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.post("http://localhost:3000/api/store/checkout", {
          headers: { Origin: "https://other.example" },
          data: input,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await page.request.get(
          "http://localhost:3000/api/store/orders/not-a-uuid",
        )
      ).status(),
    ).toBe(400);
    expect(
      (
        await page.request.get(
          "http://localhost:3000/api/store/orders/" + crypto.randomUUID(),
        )
      ).status(),
    ).toBe(404);
    await page.route("**/api/store/orders/*", (route) =>
      route.fulfill({ status: 503, json: { error: "TEST_UNAVAILABLE" } }),
    );
    await page.getByRole("button", { name: "Refresh status" }).click();
    await expect(page.locator(".nl-alert[role=alert]")).toContainText(
      "may be stale",
    );
    await expect(page.locator(".nl-status-pill")).toHaveText(
      "Warehouse acknowledged",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("http://localhost:3000/");
    await expect(
      page.getByRole("link", { name: "Northline storefront" }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    console.log(
      "PASS: catalog/category/product/cart; mobile; all six checkout/recovery flows with persisted counts; lost-response retry across reload creates one order; server price/origin/identity guards; stale-read warning; no page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
