// Advisory browser telemetry only: never use this as authorisation or gameplay input.
export const DISPLAY_PROBE_MS = 3000;
export const DISPLAY_STALE_MS = 12000;
export type DisplaySnapshot = { version: string; phase: string; round: number; question: number };
export type DisplayReply = DisplaySnapshot & { probe: string; displayId: string; visible: boolean };
export type DisplayObservation = DisplayReply & { receivedAt: number };
export type DisplayHealth = { level: 'healthy' | 'warning' | 'unknown'; summary: string };

export function displaySnapshot(row: Record<string, unknown>): DisplaySnapshot | null {
  if (typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) return null;
  return { version: row.updated_at, phase: typeof row.phase === 'string' ? row.phase : 'waiting',
    round: typeof row.round_number === 'number' ? row.round_number : 1,
    question: typeof row.current_question_index === 'number' ? row.current_question_index : 0 };
}

export function parseDisplayReply(value: unknown, probes: ReadonlyMap<string, number>, now: number): DisplayObservation | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.probe !== 'string' || typeof p.displayId !== 'string' || p.displayId.length > 80 ||
      typeof p.visible !== 'boolean' || typeof p.version !== 'string' || p.version.length > 64 || !Number.isFinite(Date.parse(p.version)) ||
      typeof p.phase !== 'string' || p.phase.length > 60 || !Number.isInteger(p.round) || !Number.isInteger(p.question)) return null;
  const sent = probes.get(p.probe);
  if (sent === undefined || now - sent > DISPLAY_STALE_MS || now < sent) return null;
  return { probe: p.probe, displayId: p.displayId, visible: p.visible, version: p.version,
    phase: p.phase, round: p.round as number, question: p.question as number, receivedAt: now };
}

export function assessDisplayHealth(expected: DisplaySnapshot | null, observations: DisplayObservation[], now: number, channelStatus: string, readError: string | null): DisplayHealth {
  if (channelStatus !== 'SUBSCRIBED') return { level: 'warning', summary: 'TV check connection unavailable' };
  if (readError || !expected) return { level: 'unknown', summary: 'Cannot verify current TV state' };
  if (!observations.length) return { level: 'unknown', summary: 'Waiting for TV reply' };
  if (observations.some(o => now - o.receivedAt > DISPLAY_STALE_MS)) return { level: 'warning', summary: 'TV reply overdue — check display' };
  if (observations.some(o => !o.visible)) return { level: 'warning', summary: 'A display tab is hidden' };
  if (observations.some(o => Date.parse(o.version) < Date.parse(expected.version))) return { level: 'warning', summary: 'TV has not confirmed the latest update' };
  return { level: 'healthy', summary: 'TV browser has received the latest update' };
}
