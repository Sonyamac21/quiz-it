import { createBrowserClient } from "@supabase/ssr";

function createHandsetClient(url: string, key: string, playerToken: string) {
  return createBrowserClient(url, key, {
    isSingleton: false,
    global: { headers: { "x-quiz-player-token": playerToken } },
  });
}

let handsetClient: ReturnType<typeof createHandsetClient> | undefined;
let handsetToken = "";

export function createSupabaseBrowserClient(playerToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  if (!playerToken) return createBrowserClient(url, key);
  if (!handsetClient || handsetToken !== playerToken) {
    handsetClient = createHandsetClient(url, key, playerToken);
    handsetToken = playerToken;
  }
  return handsetClient;
}
