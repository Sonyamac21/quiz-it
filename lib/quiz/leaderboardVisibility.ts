// Visibility is presentation state, never a gameplay phase transition.
export function leaderboardVisibilityUpdate(target: 'display' | 'handsets', visible: boolean) {
  return target === 'display'
    ? { show_scoreboard_on_display: visible }
    : { show_scoreboard: visible };
}

export function displayLeaderboardVisible(row: Record<string, unknown>) {
  return !row.hide_leaderboard && row.phase !== 'quiz_end' &&
    (row.show_scoreboard_on_display === true || row.phase === 'scoreboard');
}
