import { notFound } from "next/navigation";
import Rehearsal from "./rehearsal";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Rehearsal />;
}
