import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { QUIZ_BROADCAST_CHANNEL } from "@/lib/quiz/realtime";

export async function broadcastToHandsets(
  event: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(QUIZ_BROADCAST_CHANNEL);

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error("Could not connect to realtime channel."));
        }
      });
    });

    const result = await channel.send({
      type: "broadcast",
      event,
      payload,
    });

    await supabase.removeChannel(channel);

    if (result !== "ok") {
      return { ok: false, message: "Broadcast failed. Please try again." };
    }

    return { ok: true };
  } catch {
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
