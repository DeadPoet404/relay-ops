import { demoEnabled } from "@/lab/config";
import { StoreCheckout } from "@/components/store-checkout";
export const dynamic = "force-dynamic";
export default function CheckoutPage() {
  return <StoreCheckout enabled={demoEnabled()} />;
}
