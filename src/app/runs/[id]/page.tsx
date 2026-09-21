import { z } from "zod";
import Link from "next/link";
import { notFound } from "next/navigation";
import { demoEnabled } from "@/lab/config";
import { RunEvidence } from "@/components/run-evidence";
import "../../demo/demo.css";
export const dynamic = "force-dynamic";
export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return (
    <div className="journey-shell">
      <a className="skip-link" href="#run-main">
        Skip to content
      </a>
      <header className="journey-header">
        <Link className="journey-brand" href="/">
          relay<span>.</span>
        </Link>
        <nav aria-label="Evidence navigation">
          <Link href="/demo">Guided demo</Link>
          <Link href="/">Operations console ↗</Link>
        </nav>
        <span className="journey-mode">ONE ORDER / SAVED EVIDENCE</span>
      </header>
      <main id="run-main">
        <RunEvidence key={id} id={id} enabled={demoEnabled()} />
      </main>
      <footer className="journey-footer">
        <span>Relay / Local engineering demonstration</span>
        <span>Warehouse acknowledgement ≠ delivery</span>
      </footer>
    </div>
  );
}
