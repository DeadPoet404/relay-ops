import Link from "next/link";
import type { Metadata } from "next";
import "./demo.css";
export const metadata: Metadata = {
  title: "Relay — Follow an order through failure and recovery",
  description:
    "A guided local demonstration of safe order recovery, with fictional commerce and working integration engineering.",
};
export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="journey-shell">
      <a href="#journey-main" className="skip-link">
        Skip to content
      </a>
      <header className="journey-header">
        <Link href="/demo" className="journey-brand">
          relay<span>.</span>
        </Link>
        <nav aria-label="Demo navigation">
          <Link href="/store">Northline storefront ↗</Link>
          <Link href="/">Operations console ↗</Link>
        </nav>
        <span className="journey-mode">
          SIMULATED COMMERCE · WORKING SYSTEM
        </span>
      </header>
      <main id="journey-main">{children}</main>
      <footer className="journey-footer">
        <span>Relay / Order recovery, explained.</span>
        <span>No real payments, shipments, or customer data.</span>
        <Link href="/presenter">Advanced presenter controls ↗</Link>
      </footer>
    </div>
  );
}
