export const DEFAULT_AUDIO_MIX = { master: 0.75, cue: 0.7, timer: 0.5, music: 0.8, ambient: 0.5, spin: 0.7 };
export type AudioMix = typeof DEFAULT_AUDIO_MIX;
export function readAudioMix(value: unknown): AudioMix {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(DEFAULT_AUDIO_MIX).map(([key, fallback]) => [key,
    typeof raw[key] === "number" && Number.isFinite(raw[key]) ? Math.min(1, Math.max(0, raw[key] as number)) : fallback,
  ])) as AudioMix;
}
export function mixedVolume(mix: AudioMix, channel: Exclude<keyof AudioMix, "master">, level: number) {
  return Math.min(1, Math.max(0, level)) * mix.master * mix[channel];
}
