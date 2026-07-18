import { diagnosticTimestamp } from "@/lib/diagnostics/time";

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
export type PlatformLogEntry = { at: number; level: LogLevel; scope: string; message: string; context?: Record<string, unknown> };

const entries: PlatformLogEntry[] = [];
const listeners = new Set<(entry: PlatformLogEntry) => void>();
const LIMIT = 200;

function safeContext(value?: Record<string, unknown>) {
  if (!value) return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = item instanceof Error ? { name: item.name, message: item.message } : item;
  }
  return result;
}

function write(level: LogLevel, scope: string, message: string, context?: Record<string, unknown>) {
  const entry = { at: diagnosticTimestamp(), level, scope, message, context: safeContext(context) } satisfies PlatformLogEntry;
  entries.unshift(entry);
  if (entries.length > LIMIT) entries.length = LIMIT;
  listeners.forEach(listener => listener(entry));
  const method = level === "ERROR" ? "error" : level === "WARN" ? "warn" : level === "DEBUG" ? "debug" : "info";
  console[method](`[Quiz-It:${scope}] ${message}`, entry.context || "");
  return entry;
}

export const platformLogger = {
  info: (scope: string, message: string, context?: Record<string, unknown>) => write("INFO", scope, message, context),
  warn: (scope: string, message: string, context?: Record<string, unknown>) => write("WARN", scope, message, context),
  error: (scope: string, message: string, context?: Record<string, unknown>) => write("ERROR", scope, message, context),
  debug: (scope: string, message: string, context?: Record<string, unknown>) => write("DEBUG", scope, message, context),
  recent: () => [...entries],
  subscribe(listener: (entry: PlatformLogEntry) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

export function hostFriendlyError(error: unknown, fallback = "Something unexpected happened. The live quiz has been preserved.") {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function reportUnexpectedError(scope: string, error: unknown, fallback?: string) {
  const message = hostFriendlyError(error, fallback);
  platformLogger.error(scope, message, { error });
  return message;
}
