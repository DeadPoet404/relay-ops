import { notFound } from "next/navigation";
import { z } from "zod";
import { demoEnabled } from "@/lab/config";
import { StoreOrderView } from "@/components/store-order";
export const dynamic = "force-dynamic";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <StoreOrderView id={id} enabled={demoEnabled()} />;
}
