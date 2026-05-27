export type QuizStage = "load" | "send" | "reveal";

const STAGE_CYCLE: QuizStage[] = ["load", "send", "reveal"];

export function getNextStage(current: QuizStage): QuizStage {
  const index = STAGE_CYCLE.indexOf(current);
  return STAGE_CYCLE[(index + 1) % STAGE_CYCLE.length];
}

export function getStageLabel(stage: QuizStage): string {
  return stage.toUpperCase();
}

export function getNextStageHint(stage: QuizStage): string {
  switch (stage) {
    case "load":
      return "Press spacebar to send question to handsets";
    case "send":
      return "Press spacebar to reveal answers on all handsets";
    case "reveal":
      return "Press spacebar to return to load (host only)";
  }
}
