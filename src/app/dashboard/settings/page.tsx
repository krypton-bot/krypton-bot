import type { Metadata } from "next";
import { SettingsForm } from "@/components/dashboard/settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsForm />;
}
