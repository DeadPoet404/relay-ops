import { z } from "zod";
import { allowLabRequest } from "@/lab/config";
import { getDatabase } from "@/server/console-data";
import { readStoreOrder } from "@/store/read-order";
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
    return Response.json({ error: "INVALID_ORDER" }, { status: 400, headers });
  try {
    const order = await readStoreOrder(getDatabase().db, id);
    return Response.json(order ? { order } : { error: "ORDER_NOT_FOUND" }, {
      status: order ? 200 : 404,
      headers,
    });
  } catch {
    return Response.json(
      { error: "ORDER_STATUS_UNAVAILABLE" },
      { status: 503, headers },
    );
  }
}
