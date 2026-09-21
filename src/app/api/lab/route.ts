import { ZodError } from "zod";
import { allowLabRequest } from "@/lab/config";
import { BodyError, readSmallJson } from "@/lab/http";
import {
  createRun,
  RequestConflictError,
  RunLimitError,
} from "@/lab/create-run";
import { readRuns } from "@/lab/read-runs";
import { getDatabase } from "@/server/console-data";
import { getLabBoss } from "@/server/lab";
import { SUBMISSION_QUEUE } from "@/queue/boss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const failure = (code: string, status: number) =>
  Response.json({ error: code }, { status, headers });
export async function GET(request: Request) {
  if (!allowLabRequest(request))
    return failure("LOCAL_DEMO_DISABLED_OR_ORIGIN_REJECTED", 403);
  try {
    const runs = await readRuns(getDatabase().db);
    const boss = await getLabBoss();
    const enriched = await Promise.all(
      runs.map(async (run) => {
        const [job] = await boss.findJobs(SUBMISSION_QUEUE, { id: run.id });
        return { ...run, jobState: job?.state ?? "not retained" };
      }),
    );
    return Response.json({ runs: enriched }, { headers });
  } catch {
    return failure("LAB_UNAVAILABLE_CHECK_DATABASE_AND_QUEUE_INIT", 503);
  }
}
export async function POST(request: Request) {
  if (!allowLabRequest(request))
    return failure("LOCAL_DEMO_DISABLED_OR_ORIGIN_REJECTED", 403);
  try {
    const body = await readSmallJson(request);
    const result = await createRun(getDatabase().db, await getLabBoss(), body);
    return Response.json(result, {
      status: result.duplicate ? 200 : 201,
      headers,
    });
  } catch (error) {
    if (error instanceof BodyError)
      return failure("INVALID_JSON_REQUEST", error.status);
    if (error instanceof ZodError)
      return failure("INVALID_SCENARIO_REQUEST", 400);
    if (error instanceof RequestConflictError)
      return failure("REQUEST_ID_SCENARIO_CONFLICT", 409);
    if (error instanceof RunLimitError)
      return failure("LOCAL_LAB_RUN_LIMIT_REACHED", 429);
    return failure("LAB_UNAVAILABLE_CHECK_DATABASE_AND_QUEUE_INIT", 503);
  }
}
