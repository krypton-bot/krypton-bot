import type { Metadata } from "next";
import { CopyScreen } from "@/components/copy/copy-screen";

export const metadata: Metadata = { title: "Copy trade" };

export default function Page() {
  return <CopyScreen />;
}
