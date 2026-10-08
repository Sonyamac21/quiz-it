// Presentation only: never rewrite user content, answer keys or team names.
const labels: Record<string, string> = {
  "SAVE": "Save", "CANCEL": "Cancel", "CLOSE": "Close", "EDIT": "Edit",
  "REGEN": "Replace question", "TO LIBRARY": "Save to library",
  "COPY": "Make a copy", "REMOVE": "Remove", "DELETE": "Delete",
  "UP": "Move up", "DOWN": "Move down", "SETTINGS": "Round options",
  "HIDE SETTINGS": "Close options", "PREP MUSIC": "Prepare music",
  "SAVE QUIZ PLAN": "Save plan", "DUPLICATE QUIZ PLAN": "Make a copy",
  "ARCHIVE": "Archive", "RESTORE": "Restore", "SELECT ALL ROUNDS": "Select all rounds",
  "GENERATE ALL SELECTED": "Generate selected rounds", "GENERATING...": "Generating…",
  "+ ADD ROUND": "Add a round", "+ ADD QUESTIONS": "Add questions",
  "+ GENERATE WITH AI": "Generate questions", "+ FROM LIBRARY": "Choose from library",
  "+ RANDOM FROM LIBRARY": "Pick from library", "CREATE QUIZ PLAN": "Create quiz plan",
  "CREATE & ASSIGN TO EVENT": "Create and use for this event",
  "DUPLICATE & USE FOR THIS EVENT": "Copy for this event",
  "USE THIS QUIZ PLAN FOR THIS EVENT": "Use for this event",
  "GENERATE": "Generate questions", "SAVE ROUND": "Save round",
  "START QUIZ": "Start quiz", "NEXT QUESTION": "Next question",
  "REVEAL ANSWER": "Reveal answer", "SHOW LEADERBOARD": "Show leaderboard",
  "START": "Start", "PAUSE": "Pause", "RESUME": "Resume", "CONTINUE": "Continue",
  "DONE": "Done", "SEARCH": "Search", "UPLOAD": "Upload", "RETRY": "Try again",
};

export function friendlyControlLabel(label: string): string {
  return labels[label.trim()] ?? label;
}
