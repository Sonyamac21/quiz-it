import type { Metadata } from "next";
import Script from "next/script";
import {
  getJoinPageBodyHtml,
  getJoinPageScript,
} from "@/lib/join/join-page-content";

export const metadata: Metadata = {
  title: "Join Game | Quiz-It",
};

export default function JoinPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return (
    <div className="join-app flex min-h-0 flex-1 flex-col">
      <main
        className="flex w-full flex-1 flex-col items-stretch justify-center"
        dangerouslySetInnerHTML={{ __html: getJoinPageBodyHtml() }}
      />
      <Script id="quiz-it-join-handset" strategy="afterInteractive">
        {getJoinPageScript(supabaseUrl, supabaseKey)}
      </Script>
    </div>
  );
}
