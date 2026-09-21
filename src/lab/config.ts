import { z } from "zod";

export function demoEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV === "development" &&
    env.RELAY_ENABLE_DEMO_RUNS === "true" &&
    env.RELAY_DATA_SOURCE === "database"
  );
}
export function localOrigin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Use a loopback HTTP origin without a path or credentials");
  }
  return url.origin;
}
export function simulatorConfig(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.NODE_ENV === "production" ||
    env.RELAY_ENABLE_DEMO_RUNS !== "true" ||
    env.RELAY_DATA_SOURCE !== "database"
  )
    throw new Error("Simulator execution is disabled");
  return {
    url: localOrigin(env.RELAY_SIMULATOR_URL ?? "http://127.0.0.1:4010"),
    token: z.string().min(32).max(256).parse(env.RELAY_SIMULATOR_TOKEN),
  };
}

/** Browser-CSRF safeguards, not production authentication. The development web
 * server MUST also bind to loopback (npm run demo:dev). No forwarded headers are trusted.
 */
export function allowLabRequest(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!demoEnabled(env)) return false;
  try {
    const allowed = localOrigin(
      env.RELAY_DEMO_ORIGIN ?? "http://localhost:3000",
    );
    if (request.headers.get("host") !== new URL(allowed).host) return false;
    const origin = request.headers.get("origin");
    if (request.method !== "GET" && origin !== allowed) return false;
    if (origin && origin !== allowed) return false;
    const site = request.headers.get("sec-fetch-site");
    if (
      site &&
      site !== "same-origin" &&
      !(request.method === "GET" && site === "none")
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
