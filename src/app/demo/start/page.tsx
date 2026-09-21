import { GuidedStart } from "@/components/guided-start";
import { demoEnabled } from "@/lab/config";
export const dynamic = "force-dynamic";
export default function StartPage() {
  return <GuidedStart enabled={demoEnabled()} />;
}
