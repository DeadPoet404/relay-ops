import { z } from "zod";
import { checkoutSchema } from "../store/cart";
import { scenarioSchema, type Scenario } from "../lab/contracts";
export const guidedKey = "relay.guidedDemo";
export function pendingCheckout(storage: Pick<Storage, "getItem">) {
  const raw = storage.getItem("northline.checkout");
  if (!raw) return null;
  return checkoutSchema.parse(JSON.parse(raw));
}
/** Never discard pending identity, clear a bag, or create an order here. */
export function beginJourney(
  session: Pick<Storage, "getItem" | "setItem">,
  local: Pick<Storage, "setItem">,
  scenario: Scenario,
): "resume" | "shop" {
  scenarioSchema.parse(scenario);
  if (pendingCheckout(session)) return "resume";
  session.setItem(guidedKey, "true");
  local.setItem("northline.nextScenario", scenario);
  return "shop";
}
export function recentOrder(storage: Pick<Storage, "getItem">): string | null {
  const parsed = z.uuid().safeParse(storage.getItem("northline.lastOrder"));
  return parsed.success ? parsed.data : null;
}
