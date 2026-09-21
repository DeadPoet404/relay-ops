import { z } from "zod";
import { allowLabRequest } from "@/lab/config";
import { readRun } from "@/lab/read-runs";
import { getDatabase } from "@/server/console-data";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!allowLabRequest(request))
    return Response.json(
      { error: "LOCAL_DEMO_DISABLED_OR_ORIGIN_REJECTED" },
      { status: 403, headers },
    );
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success)
    return Response.json({ error: "INVALID_RUN" }, { status: 400, headers });
  try {
    const run = await readRun(getDatabase().db, id);
    return Response.json(run ? { run } : { error: "RUN_NOT_FOUND" }, {
      status: run ? 200 : 404,
      headers,
    });
  } catch {
    return Response.json(
      { error: "RUN_EVIDENCE_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
