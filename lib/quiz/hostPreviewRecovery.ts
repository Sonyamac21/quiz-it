export type HostPreviewRecovery = {
  sessionId: string;
  roundId: string;
  questionIndex: number;
};

const STORAGE_KEY = "quiz-it:host-preview-recovery";
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function saveHostPreviewRecovery(storage: RecoveryStorage, value: HostPreviewRecovery): void {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch {}
}

export function loadHostPreviewRecovery(storage: RecoveryStorage): HostPreviewRecovery | null {
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) || "null") as Partial<HostPreviewRecovery> | null;
    if (!value || typeof value.sessionId !== "string" || typeof value.roundId !== "string" || !Number.isInteger(value.questionIndex)) return null;
    return value as HostPreviewRecovery;
  } catch {
    return null;
  }
}

export function clearHostPreviewRecovery(storage: RecoveryStorage): void {
  try { storage.removeItem(STORAGE_KEY); } catch {}
}
