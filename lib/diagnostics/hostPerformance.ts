// Counters do not trigger React renders; diagnostics samples them when open.
export const hostPerformance = { scoreReads: 0, scorePending: 0, scoreLastMs: 0, scoreErrors: 0, scoreEvents: 0, coalesced: 0 };

// A burst gets one read plus one trailing read if events arrived in flight.
// Callers await the trailing read too, so explicit refreshes remain authoritative.
export function createRefreshQueue() {
  let running: Promise<void> | null = null;
  let next: (() => Promise<void>) | null = null;
  return (read: () => Promise<void>): Promise<void> => {
    next = read;
    if (running) { hostPerformance.coalesced++; return running; }
    running = Promise.resolve().then(async () => {
      while (next) {
        const work = next;
        next = null;
        await work();
      }
    }).finally(() => { running = null; });
    return running;
  };
}
