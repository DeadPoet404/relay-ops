import { loadConsoleData } from "@/server/console-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fictional local dataset only. No write endpoints exist. Add authentication and
 * store-level authorization before introducing real data or deploying this mode.
 */
export async function GET() {
  try {
    return Response.json(await loadConsoleData(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "DATA_SOURCE_UNAVAILABLE",
          message:
            "Check local configuration, database availability, migrations, and seeding.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
