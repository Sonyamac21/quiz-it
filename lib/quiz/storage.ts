export const TEAM_NAME_STORAGE_KEY = "quiz-it-team-name";

// Safari private browsing throws SecurityError on localStorage access.
// Wrap both operations so a storage failure never breaks the quiz flow.

export function saveTeamName(teamName: string): void {
  try {
    console.log("[storage] saveTeamName localStorage");
    localStorage.setItem(TEAM_NAME_STORAGE_KEY, teamName);
  } catch {
    console.log("[storage] saveTeamName localStorage blocked; using in-memory fallback");
    // Storage unavailable (e.g. Safari private mode) — fall back to in-memory
    // via the module-level variable below.
    _inMemoryTeamName = teamName;
  }
}

export function getTeamName(): string | null {
  try {
    const fromStorage = localStorage.getItem(TEAM_NAME_STORAGE_KEY);
    return fromStorage ?? _inMemoryTeamName;
  } catch {
    console.log("[storage] getTeamName localStorage blocked; using in-memory fallback");
    return _inMemoryTeamName;
  }
}

// In-memory fallback for environments where localStorage is blocked.
let _inMemoryTeamName: string | null = null;
