import { describe, expect, it } from "vitest";
import {
  allowLabRequest,
  demoEnabled,
  localOrigin,
  simulatorConfig,
} from "./config";
import { createRunSchema } from "./contracts";
import { BodyError, readSmallJson } from "./http";
const env = {
  NODE_ENV: "development",
  RELAY_ENABLE_DEMO_RUNS: "true",
  RELAY_DATA_SOURCE: "database",
  RELAY_DEMO_ORIGIN: "http://localhost:3000",
} as NodeJS.ProcessEnv;
function request(headers: Record<string, string> = {}, method = "POST") {
  return new Request("http://localhost:3000/api/lab", {
    method,
    headers: {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  });
}
describe("local lab boundary", () => {
  it("requires development, database mode, and an explicit opt-in", () => {
    expect(demoEnabled(env)).toBe(true);
    for (const change of [
      { NODE_ENV: "production" },
      { NODE_ENV: "test" },
      { RELAY_ENABLE_DEMO_RUNS: "false" },
      { RELAY_DATA_SOURCE: "fixtures" },
    ])
      expect(demoEnabled({ ...env, ...change } as NodeJS.ProcessEnv)).toBe(
        false,
      );
  });
  it("permits a same-origin local browser request", () =>
    expect(allowLabRequest(request(), env)).toBe(true));
  it("rejects cross-origin, missing-origin writes, unexpected hosts, and cross-site metadata", () => {
    const variations: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "" },
      { host: "public.example" },
      { "sec-fetch-site": "cross-site" },
    ];
    for (const headers of variations)
      expect(allowLabRequest(request(headers), env)).toBe(false);
  });
  it("refuses production even when explicitly enabled", () =>
    expect(allowLabRequest(request(), { ...env, NODE_ENV: "production" })).toBe(
      false,
    ));
  it("only accepts loopback HTTP origins", () => {
    expect(localOrigin("http://127.0.0.1:4010")).toBe("http://127.0.0.1:4010");
    for (const url of [
      "https://warehouse.example",
      "http://localhost:4010/path",
      "http://user:pass@localhost:4010",
      "http://localhost:4010?token=x",
    ])
      expect(() => localOrigin(url)).toThrow();
  });
  it("requires a private simulator token and rejects production simulator execution", () => {
    expect(() => simulatorConfig(env)).toThrow();
    expect(() =>
      simulatorConfig({ ...env, RELAY_SIMULATOR_TOKEN: "a".repeat(32) }),
    ).not.toThrow();
    expect(() =>
      simulatorConfig({
        ...env,
        NODE_ENV: "production",
        RELAY_SIMULATOR_TOKEN: "a".repeat(32),
      }),
    ).toThrow();
  });
  it("validates request IDs, scenarios, and rejects extra client fields", () => {
    const input = { requestId: crypto.randomUUID(), scenario: "accepted" };
    expect(createRunSchema.safeParse(input).success).toBe(true);
    expect(
      createRunSchema.safeParse({ ...input, warehouseReference: "spoof" })
        .success,
    ).toBe(false);
    expect(
      createRunSchema.safeParse({ ...input, scenario: "refund" }).success,
    ).toBe(false);
  });
  it("rejects non-JSON, malformed and oversized bodies", async () => {
    await expect(
      readSmallJson(
        new Request("http://localhost", { method: "POST", body: "{}" }),
      ),
    ).rejects.toBeInstanceOf(BodyError);
    for (const body of ["{", "x".repeat(5000)])
      await expect(
        readSmallJson(
          new Request("http://localhost", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          }),
        ),
      ).rejects.toBeInstanceOf(BodyError);
  });
  it("reads a small valid JSON body", async () =>
    expect(
      await readSmallJson(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"ok":true}',
        }),
      ),
    ).toEqual({ ok: true }));
});
