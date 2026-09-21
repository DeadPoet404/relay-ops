import { z } from "zod";
import { productById } from "./catalog";
import { scenarioSchema } from "../lab/contracts";
export const cartSchema = z
  .array(
    z
      .object({
        productId: z.string().min(1).max(50),
        quantity: z.number().int().min(1).max(5),
      })
      .strict(),
  )
  .min(1)
  .max(4)
  .superRefine((items, context) => {
    if (new Set(items.map((i) => i.productId)).size !== items.length)
      context.addIssue({ code: "custom", message: "Duplicate product IDs" });
    if (items.some((i) => !productById(i.productId)))
      context.addIssue({ code: "custom", message: "Unknown product" });
  });
export type Cart = z.infer<typeof cartSchema>;
export interface LineItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  image: string;
  color: string;
}
export const checkoutSchema = z
  .object({ requestId: z.uuid(), scenario: scenarioSchema, items: cartSchema, paced: z.boolean().optional() })
  .strict();
export type CheckoutRequest = z.infer<typeof checkoutSchema>;
export function priceCart(input: unknown) {
  const cart = cartSchema
    .parse(input)
    .sort((a, b) => a.productId.localeCompare(b.productId));
  const items: LineItem[] = cart.map(({ productId, quantity }) => {
    const p = productById(productId)!;
    return {
      productId,
      quantity,
      name: p.name,
      unitPrice: p.price,
      image: p.image,
      color: p.color,
    };
  });
  return {
    fingerprint: JSON.stringify(cart),
    items,
    totalMinor: items.reduce((n, i) => n + i.unitPrice * i.quantity, 0),
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
  };
}
export interface StoreOrder {
  id: string;
  number: string;
  createdAt: string;
  items: LineItem[];
  totalMinor: number;
  status: "placed" | "confirming" | "review" | "acknowledged";
}
export function customerStatus(run: {
  status: string;
  reviewReason: string | null;
}): StoreOrder["status"] {
  if (run.status === "accepted") return "acknowledged";
  if (run.reviewReason || run.status === "rejected") return "review";
  return run.status === "queued" ? "placed" : "confirming";
}
