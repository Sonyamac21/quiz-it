"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// This page was a duplicate of the real Question Library at
// /host/question-bank, built before that existing page was discovered.
// Redirecting rather than deleting, since this file can't be removed from
// the connected workspace folder - /host/question-bank is the one true
// Question Library screen (topic filters, review workflow, build-a-round,
// add-to-round all live there).
export default function LibraryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/host/question-bank");
  }, [router]);
  return null;
}
