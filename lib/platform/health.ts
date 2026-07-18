import type { ShowAudioState } from "@/lib/audio/showAudio";

export type HealthLevel = "healthy" | "warning" | "problem" | "unknown";
export type HealthSignal = { level: HealthLevel; summary: string; updatedAt: number | null };
export type PlatformStatus = {
  overall: HealthLevel;
  realtime: HealthSignal;
  audio: HealthSignal;
  timers: HealthSignal;
  display: HealthSignal;
  session: HealthSignal;
  diagnostics: HealthSignal;
};

const priority: Record<HealthLevel, number> = { healthy: 0, unknown: 1, warning: 2, problem: 3 };

export function createPlatformStatus(input: {
  now: number;
  sessionId: string | null;
  realtimeStatus: string;
  realtimeLastSync: number | null;
  realtimeStaleAfter: number;
  audio: ShowAudioState;
  timerRunning: boolean;
  timerRemaining: number;
  displayKnown: boolean;
  diagnosticsEnabled: boolean;
}): PlatformStatus {
  const realtimeAge = input.realtimeLastSync ? input.now - input.realtimeLastSync : Infinity;
  const realtime: HealthSignal = input.realtimeStatus !== "SUBSCRIBED"
    ? { level: "problem", summary: input.realtimeStatus.toLowerCase(), updatedAt: input.realtimeLastSync }
    : realtimeAge > input.realtimeStaleAfter
      ? { level: "warning", summary: "Subscribed; no recent sync", updatedAt: input.realtimeLastSync }
      : { level: "healthy", summary: "Subscribed", updatedAt: input.realtimeLastSync };
  const status: Omit<PlatformStatus, "overall"> = {
    realtime,
    audio: { level: input.audio.overlap ? "problem" : "healthy", summary: input.audio.overlap ? "Unexpected overlap" : `${input.audio.active.length} active channel(s)`, updatedAt: input.now },
    timers: { level: input.timerRunning && input.timerRemaining <= 0 ? "problem" : "healthy", summary: input.timerRunning ? `${input.timerRemaining}s remaining` : "Stopped", updatedAt: input.now },
    display: { level: input.displayKnown ? "healthy" : "unknown", summary: input.displayKnown ? "Telemetry available" : "Heartbeat unavailable", updatedAt: null },
    session: { level: input.sessionId ? "healthy" : "problem", summary: input.sessionId ? "Session active" : "No session", updatedAt: input.now },
    diagnostics: { level: input.diagnosticsEnabled ? "healthy" : "unknown", summary: input.diagnosticsEnabled ? "Available" : "Disabled", updatedAt: input.now },
  };
  const overall = Object.values(status).reduce<HealthLevel>((current, signal) => priority[signal.level] > priority[current] ? signal.level : current, "healthy");
  return { overall, ...status };
}
