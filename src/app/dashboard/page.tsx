import type { Metadata } from "next";
import { Overview } from "@/components/dashboard/overview";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <Overview />;
}
