import { playShowAudio, stopShowAudio, victorySongAudioFile } from "./showAudio";

/** A new positive spin is a new celebration, even if this team's song just played. */
export function playPositiveSpinAudio(song?: string, audioEnabled = true) {
  if (!audioEnabled) return;
  playShowAudio("airhorn.mp3", { channel: "cue", volume: 0.65 });
  if (song) {
    stopShowAudio("music");
    playShowAudio(victorySongAudioFile(song), { channel: "music" });
  }
}
