import { z, ZodError } from "zod";
import { allowLabRequest } from "@/lab/config";
import { BodyError, readSmallJson } from "@/lab/http";
import { getDatabase } from "@/server/console-data";
import { getLabBoss } from "@/server/lab";
import { requestLookup } from "@/recovery/process";
import { RunBusyError } from "@/recovery/state";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (!allowLabRequest(request))
    return Response.json(
      { error: "LOCAL_DEMO_DISABLED_OR_ORIGIN_REJECTED" },
      { status: 403, headers },
    );
  try {
    const { runId } = z
      .object({ runId: z.uuid() })
      .strict()
      .parse(await readSmallJson(request));
    return Response.json(
      await requestLookup(getDatabase(), await getLabBoss(), runId),
      { headers },
    );
  } catch (error) {
    const status =
      error instanceof RunBusyError
        ? 409
        : error instanceof BodyError
          ? error.status
          : error instanceof ZodError
            ? 400
            : 503;
    return Response.json(
      {
        error:
          status === 409
            ? "RUN_BUSY_TRY_AGAIN"
            : "LOOKUP_REQUEST_NOT_CONFIRMED",
      },
      { status, headers },
    );
  }
}
