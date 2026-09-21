import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
if (process.env.RELAY_BROWSER_TESTS !== "true") {
  console.error(
    "Opt in with RELAY_BROWSER_TESTS=true. This local check creates three persisted synthetic orders; the dev app, simulator, and worker must be running.",
  );
  process.exit(1);
}
fs.mkdirSync("test-results/guided", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000/demo", { waitUntil: "networkidle" });
  await expect(
    page.getByRole("heading", {
      name: "Fictional commerce. Real engineering.",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/guided/landing.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/guided/landing-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("link", { name: "Try the demo", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "What happens after checkout?" }),
  ).toBeVisible();
  for (const [scenario, title, outcome] of [
    [
      "accepted_timeout",
      "The warehouse reply goes missing",
      "Order confirmed. No repeat submission recorded.",
    ],
    [
      "address_rejected",
      "The address needs attention",
      "Automation stopped. A person needs to review.",
    ],
    [
      "lookup_unavailable",
      "The warehouse cannot confirm what happened",
      "Automation stopped. A person needs to review.",
    ],
  ]) {
    await page.goto("http://localhost:3000/demo/start");
    if (scenario === "lookup_unavailable")
      await page
        .getByText("Explore three more scenarios", { exact: false })
        .click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    if (scenario === "accepted_timeout")
      await page.screenshot({
        path: "test-results/guided/choose.png",
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Shop this demo", exact: true })
      .click();
    await expect(page.locator(".nl-guided-bar")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("northline.nextScenario")),
    ).toBe(scenario);
    await page
      .getByRole("button", { name: "Add Ridge Daypack to bag", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Continue to demo checkout", exact: false })
      .click();
    await page.getByRole("checkbox").check();
    let id;
    if (scenario === "accepted_timeout") {
      await page.route(
        "**/api/store/checkout",
        async (route) => {
          const result = await route.fetch();
          id = (await result.json()).runId;
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
      await page.goto("http://localhost:3000/demo/start");
      await expect(
        page.getByRole("button", { name: "Shop this demo", exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByText("You have an unfinished checkout.", { exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          localStorage.getItem("northline.nextScenario"),
        ),
      ).toBe(scenario);
      await page
        .getByRole("link", { name: "Resume the same checkout", exact: false })
        .click();
      await page.getByRole("checkbox").check();
      const response = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/store/checkout") &&
          r.request().method() === "POST",
      );
      await page
        .getByRole("button", { name: "Retry same demo checkout", exact: true })
        .click();
      const r = await response;
      expect(r.status()).toBe(200);
      expect((await r.json()).runId).toBe(id);
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
      id = (await r.json()).runId;
    }
    await page.waitForURL(`**/store/orders/${id}`);
    await page
      .getByRole("link", {
        name: "See how Relay handled this order",
        exact: false,
      })
      .click();
    await page.waitForURL(`**/runs/${id}`);
    await expect(page.locator(".journey-order-strip")).toContainText(
      `NL-${id.slice(0, 8).toUpperCase()}`,
    );
    await expect(page.locator(".journey-result h2")).toHaveText(outcome, {
      timeout: 35000,
    });
    const r = await page.request.get(
      `http://localhost:3000/api/lab/runs/${id}`,
    );
    expect(r.status()).toBe(200);
    const original = (await r.json()).run;
    expect(original.id).toBe(id);
    expect(original.attemptCount).toBe(1);
    expect(original.lookupCount).toBe(
      scenario === "accepted_timeout"
        ? 1
        : scenario === "lookup_unavailable"
          ? 3
          : 0,
    );
    await page
      .getByText("Inspect the saved evidence", { exact: false })
      .click();
    if (scenario === "accepted_timeout") {
      await expect(
        page.getByText("Original fulfillment recovered", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: "test-results/guided/result.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: "test-results/guided/result-mobile.png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.reload();
    await expect(page.locator(".journey-result h2")).toHaveText(outcome);
    const after = (
      await (
        await page.request.get(`http://localhost:3000/api/lab/runs/${id}`)
      ).json()
    ).run;
    expect(after.events.length).toBe(original.events.length);
    expect(after.attemptCount).toBe(original.attemptCount);
    await page.goto("http://localhost:3000/demo/start");
    await page
      .getByRole("link", { name: "View your last demo result", exact: false })
      .click();
    await page.waitForURL(`**/runs/${id}`);
    if (scenario === "lookup_unavailable") {
      await expect(page.locator(".journey-result h2")).toHaveText(outcome);
      await page.route("**/api/lab/runs/*", (route) =>
        route.fulfill({ status: 503, json: { error: "TEST_UNAVAILABLE" } }),
      );
      await page.getByRole("button", { name: "Refresh evidence" }).click();
      await expect(page.locator('.journey-notice[role="alert"]')).toContainText(
        "may be stale",
      );
      await expect(page.locator(".journey-result h2")).toHaveText(outcome);
      await page.unroute("**/api/lab/runs/*");
    }
  }
  const missing = crypto.randomUUID();
  expect(
    (
      await page.request.get(`http://localhost:3000/api/lab/runs/${missing}`)
    ).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("http://localhost:3000/api/lab/runs/invalid")
    ).status(),
  ).toBe(400);
  expect(
    (
      await page.request.get(`http://localhost:3000/api/lab/runs/${missing}`, {
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post(`http://localhost:3000/api/lab/runs/${missing}`, {
        headers: { Origin: "http://localhost:3000" },
        data: {},
      })
    ).status(),
  ).toBe(405);
  await page.goto(`http://localhost:3000/runs/${missing}`);
  await expect(page.locator('.journey-notice[role="alert"]')).toContainText(
    "Order not found",
  );
  await expect(page.locator(".journey-result")).toHaveCount(0);
  await page.goto("http://localhost:3000/demo/start");
  await page.evaluate(() =>
    sessionStorage.setItem("northline.checkout", "not valid json"),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Shop this demo", exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.journey-notice[role="alert"]')).toContainText(
    "could not be read",
  );
  await page.evaluate(() => sessionStorage.removeItem("northline.checkout"));
  expect(errors).toEqual([]);
  console.log(
    "PASS: guided landing/selection/checkout/exact result; pending identity preserved across navigation; successful and review evidence; recent shortcut; read-only reload; stale/missing/invalid/cross-origin states; mobile; no browser runtime errors. Three synthetic purchases created.",
  );
} finally {
  await browser.close();
}
