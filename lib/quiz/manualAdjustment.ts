export type PendingManualAdjustment = {
  pin: string;
  team: string;
  delta: number;
  eventKey: string;
};

const STORAGE_KEY = "quiz-it:pending-manual-adjustment";

type AdjustmentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadPendingManualAdjustment(storage: AdjustmentStorage): PendingManualAdjustment | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingManualAdjustment>;
    if (typeof value.pin !== "string" || typeof value.team !== "string" || typeof value.delta !== "number" || !Number.isFinite(value.delta) || typeof value.eventKey !== "string") return null;
    return { pin: value.pin, team: value.team, delta: value.delta, eventKey: value.eventKey };
  } catch {
    return null;
  }
}

export function savePendingManualAdjustment(storage: AdjustmentStorage, operation: PendingManualAdjustment): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(operation));
  } catch {
    // Storage may be unavailable in privacy-restricted browsers. The in-memory
    // ref still protects retries for the lifetime of the current host tab.
  }
}

export function clearPendingManualAdjustment(storage: AdjustmentStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // A failed cleanup must not turn a confirmed score adjustment into an
    // apparent host-side failure.
  }
}
