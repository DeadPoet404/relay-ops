import { RelayConsole } from "@/components/relay-console";
import { loadConsoleData } from "@/server/console-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  let data;
  try {
    data = await loadConsoleData();
  } catch {
    return (
      <main className="database-error">
        <span className="eyebrow">RELAY / DATA SOURCE UNAVAILABLE</span>
        <h1>Your data source needs attention.</h1>
        <p>
          Relay could not read the configured dataset. It has not substituted
          fixture records or reported an empty queue.
        </p>
        <ol>
          <li>
            Check <code>RELAY_DATA_SOURCE</code> in your environment.
          </li>
          <li>
            For database mode, start PostgreSQL and verify{" "}
            <code>DATABASE_URL</code>.
          </li>
          <li>
            Run <code>npm run db:migrate</code> and <code>npm run db:seed</code>
            .
          </li>
          <li>Restart Next.js after changing environment variables.</li>
        </ol>
        <form action="/" method="get">
          <button className="button button-primary" type="submit">
            Try again
          </button>
        </form>
        <p className="database-error-note">
          Local demonstration only. No Shopify or warehouse connection is
          active.
        </p>
      </main>
    );
  }
  return <RelayConsole data={data} />;
}
