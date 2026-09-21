import type { Metadata } from "next";
import "./globals.css";
import { LiveJourneyWidget } from "@/components/live-journey";

export const metadata: Metadata = {
  title: "Relay — Order Recovery Console",
  description:
    "A clearly labelled demonstration of an e-commerce order exception and recovery workspace.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <LiveJourneyWidget />
      </body>
    </html>
  );
}
