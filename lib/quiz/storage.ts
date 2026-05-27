export const TEAM_NAME_STORAGE_KEY = "quiz-it-team-name";

export function saveTeamName(teamName: string) {
  localStorage.setItem(TEAM_NAME_STORAGE_KEY, teamName);
}

export function getTeamName(): string | null {
  return localStorage.getItem(TEAM_NAME_STORAGE_KEY);
}
