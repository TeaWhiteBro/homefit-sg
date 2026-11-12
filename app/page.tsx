import ChatAdvisor from "@/components/ChatAdvisor";
import { AREAS, DATASET_META } from "@/lib/areas";

export default function HomePage() {
  return <ChatAdvisor areas={AREAS} meta={DATASET_META} />;
}
