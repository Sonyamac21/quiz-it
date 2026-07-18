import { redirect } from "next/navigation";

export default function LegacyEventBuilderRedirect() {
  redirect("/host/events");
}
