import { ZodError } from "zod";
import { allowLabRequest } from "@/lab/config";
import { BodyError, readSmallJson } from "@/lab/http";
import {
  createRun,
  RequestConflictError,
  RunLimitError,
} from "@/lab/create-run";
import { checkoutSchema } from "@/store/cart";
import { getDatabase } from "@/server/console-data";
import { getLabBoss } from "@/server/lab";
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
    const { items, ...run } = checkoutSchema.parse(
      await readSmallJson(request),
    );
    const result = await createRun(
      getDatabase().db,
      await getLabBoss(),
      run,
      items,
    );
    return Response.json(result, {
      status: result.duplicate ? 200 : 201,
      headers,
    });
  } catch (error) {
    const status =
      error instanceof BodyError
        ? error.status
        : error instanceof ZodError
          ? 400
          : error instanceof RequestConflictError
            ? 409
            : error instanceof RunLimitError
              ? 429
              : 503;
    return Response.json(
      {
        error:
          status === 409
            ? "REQUEST_ID_CONFLICT"
            : status === 429
              ? "LOCAL_DEMO_LIMIT_REACHED"
              : "CHECKOUT_NOT_CONFIRMED",
      },
      { status, headers },
    );
  }
}
