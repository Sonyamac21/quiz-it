export type PlatformFeature = "pursuit" | "hardDeck" | "spinToWin" | "tapType" | "powerCards" | "aiGeneration" | "diagnostics";

function enabled(value: string | undefined, fallback = true) {
  if (value === undefined || value === "") return fallback;
  return !["0", "false", "off", "disabled"].includes(value.toLowerCase());
}

export const FEATURE_FLAGS: Readonly<Record<PlatformFeature, boolean>> = Object.freeze({
  pursuit: enabled(process.env.NEXT_PUBLIC_FEATURE_PURSUIT),
  hardDeck: enabled(process.env.NEXT_PUBLIC_FEATURE_HARD_DECK),
  spinToWin: enabled(process.env.NEXT_PUBLIC_FEATURE_SPIN_TO_WIN),
  tapType: enabled(process.env.NEXT_PUBLIC_FEATURE_TAP_TYPE),
  powerCards: enabled(process.env.NEXT_PUBLIC_FEATURE_POWER_CARDS),
  aiGeneration: enabled(process.env.NEXT_PUBLIC_FEATURE_AI_GENERATION),
  diagnostics: enabled(process.env.NEXT_PUBLIC_FEATURE_DIAGNOSTICS),
});

export function isFeatureEnabled(feature: PlatformFeature) { return FEATURE_FLAGS[feature]; }
