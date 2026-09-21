import { demoEnabled } from "@/lab/config";
import { StorePresenter } from "@/components/store-presenter";
import "../store/store.css";
export const dynamic = "force-dynamic";
export default function PresenterPage() {
  return <StorePresenter enabled={demoEnabled()} />;
}
