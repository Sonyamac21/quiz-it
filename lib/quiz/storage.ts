export const TEAM_NAME_STORAGE_KEY = "quiz-it-team-name";

// Safari private browsing throws SecurityError on localStorage access.
// Wrap both operations so a storage failure never breaks the quiz flow.

export function saveTeamName(teamName: string): void {
  try {
    localStorage.setItem(TEAM_NAME_STORAGE_KEY, teamName);
  } catch {
    // Storage unavailable (e.g. Safari private mode) — fall back to in-memory
    // via the module-level variable below.
    _inMemoryTeamName = teamName;
  }
}

export function getTeamName(): string | null {
  try {
    return localStorage.getItem(TEAM_NAME_STORAGE_KEY) ?? _inMemoryTeamName;
  } catch {
    return _inMemoryTeamName;
  }
}

// In-memory fallback for environments where localStorage is blocked.
let _inMemoryTeamName: string | null = null;
