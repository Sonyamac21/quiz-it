export const PLATFORM_CONFIG = Object.freeze({
  timers: {
    defaultSeconds: 30,
    fixedQuestionSeconds: 15,
    writtenAnswerSeconds: 30,
    tickMilliseconds: 1000,
  },
  polling: {
    playerSessionMilliseconds: 500,
    playerTeamOrderMilliseconds: 3000,
    playerHeartbeatMilliseconds: 5000,
    hostAnswerSafetyMilliseconds: 2500,
    hostSpinSafetyMilliseconds: 500,
    displaySessionMilliseconds: 1000,
    displayScoreboardMilliseconds: 1000,
    hostTeamSafetyMilliseconds: 4000,
    hostTeamHeartbeatMilliseconds: 4000,
  },
  reconnect: {
    displayAttempts: 3,
    displayRetryMilliseconds: 2000,
    requestTimeoutMilliseconds: 8000,
  },
  display: {
    powerCardRotationMilliseconds: 8000,
    announcementVisibleMilliseconds: 3200,
    announcementClearMilliseconds: 3600,
    winnerPhotoDelayMilliseconds: 2000,
  },
  diagnostics: {
    sampleMilliseconds: 1000,
    recentEventLimit: 200,
    staleRealtimeMilliseconds: 10_000,
    staleHeartbeatMilliseconds: 12_000,
  },
  audio: {
    cue: 0.55,
    timer: 0.3,
    music: 0.85,
    ambient: 0.45,
    spin: 0.55,
  },
  motion: {
    instantMilliseconds: 80,
    fastMilliseconds: 160,
    standardMilliseconds: 240,
    momentMilliseconds: 400,
    showpieceMilliseconds: 700,
  },
} as const);

export type PlatformConfig = typeof PLATFORM_CONFIG;
