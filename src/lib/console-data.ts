import { demoOrders, type OrderException } from "./demo-data";

export interface ConsoleData {
  source: "fixtures" | "database";
  labEnabled?: boolean;
  storeName: string;
  snapshotAt: string;
  orders: OrderException[];
}

export function fixtureConsoleData(): ConsoleData {
  return {
    source: "fixtures",
    storeName: "Northline Supply",
    snapshotAt: "2026-09-20T10:00:00.000Z",
    orders: demoOrders,
  };
}

export function snapshotLabel(iso: string) {
  const date = new Date(iso);
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date) + ` · ${iso.slice(11, 16)} UTC`
  );
}
