import type { Metadata } from "next";
import { StoreShell } from "@/components/store-shell";
import "./store.css";
export const metadata: Metadata = {
  title: "Northline Supply — Everyday, considered.",
  description:
    "A fictional everyday-carry store connected to Relay's working order recovery demo.",
};
export default function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StoreShell>{children}</StoreShell>;
}
