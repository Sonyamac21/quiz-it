"use client";

export type ShowAudioChannel = "cue" | "timer" | "music" | "ambient" | "spin";

export const SHOW_AUDIO_VOLUME = {
  cue: 0.55,
  timer: 0.3,
  music: 0.85,
  ambient: 0.45,
  spin: 0.55,
} as const;

const active = new Map<ShowAudioChannel, HTMLAudioElement>();
const preloaded = new Map<string, HTMLAudioElement>();
const activeFiles = new Map<ShowAudioChannel, string>();
const listeners = new Set<(state: ShowAudioState) => void>();

export type ShowAudioState = { active: Array<{ channel: ShowAudioChannel; file: string }>; overlap: boolean };

export function getShowAudioState(): ShowAudioState {
  const entries = [...activeFiles].map(([channel, file]) => ({ channel, file }));
  return { active: entries, overlap: entries.length > 2 };
}

function emitAudioState() { const state = getShowAudioState(); listeners.forEach(listener => listener(state)); }
export function subscribeShowAudio(listener: (state: ShowAudioState) => void) { listeners.add(listener); listener(getShowAudioState()); return () => { listeners.delete(listener); }; }

function soundUrl(file: string) {
  return file.startsWith("/") ? file : `/sounds/${file}`;
}

export function preloadShowAudio(files: string[]) {
  if (typeof Audio === "undefined") return;
  for (const file of files) {
    if (preloaded.has(file)) continue;
    const audio = new Audio(soundUrl(file));
    audio.preload = "auto";
    audio.load();
    preloaded.set(file, audio);
  }
}

export function stopShowAudio(channel: ShowAudioChannel) {
  const audio = active.get(channel);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
  active.delete(channel);
  activeFiles.delete(channel);
  emitAudioState();
}

export function stopAllShowAudio() {
  for (const channel of [...active.keys()]) stopShowAudio(channel);
}

export function playShowAudio(
  file: string,
  options: { channel?: ShowAudioChannel; volume?: number; loop?: boolean } = {},
) {
  if (typeof Audio === "undefined") return null;
  const channel = options.channel ?? "cue";
  stopShowAudio(channel);
  const cached = preloaded.get(file);
  const audio = cached ? cached.cloneNode() as HTMLAudioElement : new Audio(soundUrl(file));
  audio.volume = options.volume ?? SHOW_AUDIO_VOLUME[channel];
  audio.loop = options.loop ?? false;
  active.set(channel, audio);
  activeFiles.set(channel, file);
  emitAudioState();
  const release = () => { if (active.get(channel) === audio) { active.delete(channel); activeFiles.delete(channel); emitAudioState(); } };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  audio.play().catch(release);
  return audio;
}
