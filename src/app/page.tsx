import { redirect } from "next/navigation";

// No landing page: the app opens straight into the dashboard.
export default function Home() {
  redirect("/dashboard");
}
