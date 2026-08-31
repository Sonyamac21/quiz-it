"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LibraryRound, QuizDefinition, QuizRound } from "@/lib/quiz-builder/types";
import { generateAllRounds, generateValidatedRound, quickExclusionState, type RoundGenerationSpec } from "@/lib/quiz/generateRound";
import { PURSUIT_TOTAL_QUESTIONS } from "@/lib/quiz/pursuit";
import { HostButton, HostEmpty, HostInput, HostLabel, HostLoading, HostShell, Toggle } from "@/components/fable/HostConsole";
import { useConfirmDialog, useToastQueue } from "@/components/ui/quiz-it-ui";
import { getMediaUrl } from "@/lib/getMediaUrl";
import { persistPixabayImage } from "@/lib/quiz/persistPixabayImage";
import { roundMusicIsPrepped } from "@/lib/quiz/planStatus";

const BG = "radial-gradient(ellipse 55% 45% at 50% 45%, rgba(190,38,193,0.12), transparent 70%), #0A0118";

type GuidedIntent = "create" | "duplicate" | "assign";
type GuidedEvent = { id: string; label: string };
const VALID_INTENTS: GuidedIntent[] = ["create", "duplicate", "assign"];
// Shape of a saved Question Library row (question_bank table) - only the
// fields this page reads/writes when inserting one into a Quiz Plan round.
type BankQuestion = {
  id: string;
  question_text: string;
  question_type: string;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  correct_answer: string;
  difficulty: string;
  round_type: string;
};

export default function QuizBuilderPage() {
  const { confirm: confirmDialog, dialog: confirmDialogEl } = useConfirmDialog();
  const { showToast, toastEl } = useToastQueue();
  const [quizzes, setQuizzes] = useState<QuizDefinition[]>([]);
  const [rounds, setRounds] = useState<LibraryRound[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [roundTypeFilter, setRoundTypeFilter] = useState("");

  // Guided "Create / Assign Quiz" workflow, arrived at from a Calendar Event
  // that has no Quiz Plan yet (app/host/events/page.tsx). ?forEvent=<id> +
  // ?intent=create|duplicate|assign puts this page into a mode that, once a
  // quiz is ready, assigns it to that event and returns the host straight
  // back to it - no manual navigation required.
  const [guidedIntent, setGuidedIntent] = useState<GuidedIntent | null>(null);
  const [guidedEvent, setGuidedEvent] = useState<GuidedEvent | null>(null);
  // Distinguishes "haven't looked up the event yet" from "looked it up and
  // it genuinely doesn't exist" (deleted mid-workflow, stale/hand-typed
  // link, etc.) - without this a vanished event silently falls back to a
  // fake "this event" label instead of a clear dead end.
  const [guidedChecked, setGuidedChecked] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  // Set once a guided "duplicate for this event" copy has actually been
  // attached to the event in the background - lets the banner switch from
  // "duplicate it" instructions to "now build it", without leaving guided
  // mode (and without navigating away, unlike a plain assign).
  const [guidedAttached, setGuidedAttached] = useState(false);
  const [showPlanList, setShowPlanList] = useState(true);
  // Quiz-plan picker/manager - was a bare native <select>, which with a
  // couple dozen real + test/duplicate plans became an unmanageable wall of
  // text with no way to tell them apart or clean any of them up without
  // first opening each one individually. This drives a proper panel instead
  // (name + round count + Open/Archive/Delete per row, archived hidden by
  // default behind a toggle so old/test plans don't dominate the list).
  const [plansPanelOpen, setPlansPanelOpen] = useState(false);
  const [showArchivedPlans, setShowArchivedPlans] = useState(false);
  const [swappingKey, setSwappingKey] = useState<string | null>(null);
  const [draggedQuestionIndex, setDraggedQuestionIndex] = useState<number | null>(null);
  const [dragOverQuestionIndex, setDragOverQuestionIndex] = useState<number | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [draggedQuestionSource, setDraggedQuestionSource] = useState<{ roundId: string; index: number } | null>(null);
  const [dragOverRoundId, setDragOverRoundId] = useState<string | null>(null);
  const [dragOverLibrary, setDragOverLibrary] = useState(false);
  const [draggedRoundIndex, setDraggedRoundIndex] = useState<number | null>(null);
  const [photoSearching, setPhotoSearching] = useState(false);
  const [photoCandidates, setPhotoCandidates] = useState<{ id: number; thumb: string; full: string; tags: string }[]>([]);
  const [photoSearchError, setPhotoSearchError] = useState("");
  async function searchPhotos(query: string) {
    if (!query.trim()) return;
    setPhotoSearching(true);
    setPhotoSearchError("");
    try {
      const res = await fetch("/api/pixabay-search?q=" + encodeURIComponent(query.trim()));
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Search failed");
      setPhotoCandidates(data.candidates || []);
      if (!data.candidates?.length) setPhotoSearchError("No photos found for that search - try different words.");
    } catch (e) {
      setPhotoCandidates([]);
      setPhotoSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setPhotoSearching(false);
    }
  }
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [settingsOpenRoundId, setSettingsOpenRoundId] = useState<string | null>(null);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const [addQuestionOpenId, setAddQuestionOpenId] = useState<string | null>(null);
  const [manualQText, setManualQText] = useState("");
  const [manualAText, setManualAText] = useState("");
  const [libraryOpenId, setLibraryOpenId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryResults, setLibraryResults] = useState<BankQuestion[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  // Bulk/parallel question generation ("Generate All Rounds"). Lives alongside
  // the existing per-round generator at /host/questions - this does not replace
  // it, it lets a host configure several rounds at once and generate them all
  // in parallel via generateAllRounds() (lib/quiz/generateRound.ts).
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfig, setBulkConfig] = useState<Record<string, { selected: boolean; count: number; theme: string; difficulty: string }>>({});
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<Record<string, string>>({});
  // Which round is currently mid-"generate more" from the per-round Questions
  // panel (see generateMoreForRound) - separate from bulkRunning/bulkProgress
  // above since that pair is only ever driven by the top-of-page "GENERATE
  // ALL SELECTED" flow, and this one-round action needs its own disabled/
  // status state so it doesn't fight with or get hidden by that panel.
  const [generatingMoreId, setGeneratingMoreId] = useState<string | null>(null);
  const [generatingMoreStatus, setGeneratingMoreStatus] = useState("");
  // Separate from generatingMoreId/generatingMoreStatus above: those two also
  // control the "GENERATE WITH AI" button's disabled state (see the render),
  // so leaving them set to keep a shortfall/failure message on screen would
  // lock the host out of retrying. This map instead just remembers the last
  // OUTCOME message per round, shown independently of whether generation is
  // still in flight, and cleared only when a new generation starts for that
  // round - so a "stopped after 90s, got 0 of 8" explanation actually stays
  // readable instead of vanishing after a flat 4s (see generateMoreForRound).
  const [lastGenerateMoreResult, setLastGenerateMoreResult] = useState<Record<string, string>>({});
  // How many more questions to request per round, shown as a visible,
  // editable inline field next to "+ GENERATE WITH AI" (see
  // generateMoreForRound above for why this replaced a window.prompt()).
  const [generateMoreCounts, setGenerateMoreCounts] = useState<Record<string, number>>({});
  function openBulkGenerate() {
    if (!selected) return;
    const initial: Record<string, { selected: boolean; count: number; theme: string; difficulty: string }> = {};
    selected.quiz_rounds.forEach(r => {
      initial[r.id] = { selected: false, count: r.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (r.target_count || r.questions.length || 10), theme: r.theme ?? "", difficulty: r.difficulty || "mixed" };
    });
    setBulkConfig(initial);
    setBulkProgress({});
    setBulkOpen(true);
  }
  function updateBulkConfig(roundId: string, patch: Partial<{ selected: boolean; count: number; theme: string; difficulty: string }>) {
    setBulkConfig(prev => ({ ...prev, [roundId]: { ...prev[roundId], ...patch } }));
    // Persist the target count itself (not just theme/difficulty, which were
    // already saved elsewhere) the moment a host changes it, so "Hot Seat =
    // 5" survives a reload instead of reverting to questions.length||10 -
    // see the target_count migration/comment for the full story.
    if (patch.count !== undefined && Number.isFinite(patch.count)) {
      const count = patch.count;
      const supabase = createSupabaseBrowserClient();
      void supabase.from("quiz_rounds").update({ target_count: count }).eq("id", roundId);
      setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === roundId ? { ...r, target_count: count } : r) }));
    }
  }
  const ROUND_TYPE_LABELS: Record<string, string> = {
    regular: "Regular",
    multi_tap: "Multi Tap",
    pursuit: "The Pursuit",
    hot_seat: "Hot Seat",
    bonus: "Bonus",
    hard_deck: "The Hard Deck",
  };
  // Round types that are AI-question rounds and can be generated. Hard Deck
  // (and any future non-question round type) is added to the running order as
  // a placeholder only - it has its own standalone start button on the live
  // quiz screen and never needs generated questions. Bonus uses the same
  // mixed-question-type generation as Regular (generateRound.ts falls
  // through to its default mixed-type branch for any unrecognised round
  // type), it just gets its own label/tab so it's distinguishable in the
  // running order.
  const GENERATABLE_ROUND_TYPES = new Set(["regular", "music", "multi_tap", "pursuit", "hot_seat", "bonus"]);
  // Adds a brand-new, empty round straight into this Quiz Plan's running order
  // (no need to first create/save it in the Round Library) and immediately
  // selects it in the Generate All panel with sensible defaults, so a host can
  // plan an entire night - Round 1 Regular 10Q, Round 2 Multi Tap 10Q, etc. -
  // and then hit one Generate button, instead of pre-building each round in
  // the library first.
  async function addBlankRoundSlot(roundType: string) {
    if (!selected) return;
    const supabase = createSupabaseBrowserClient();
    const existingOfType = selected.quiz_rounds.filter(r => r.round_type === roundType).length;
    const name = ROUND_TYPE_LABELS[roundType] + " Round" + (existingOfType ? " " + (existingOfType + 1) : "");
    const { data, error: insertError } = await supabase.from("quiz_rounds").insert({
      quiz_id: selected.id,
      source_round_id: null,
      position: selected.quiz_rounds.length,
      name,
      round_type: roundType,
      difficulty: "mixed",
      questions: [],
      hide_leaderboard: false,
      allow_power_cards: true,
      points_per_question: null,
      danger_zone_enabled: false,
      danger_zone_penalty: 5,
      max_time_bonus: 5,
    }).select("*").single();
    if (insertError || !data) return;
    const newRound = data as QuizRound;
    setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, quiz_rounds: [...q.quiz_rounds, newRound] } : q));
    if (GENERATABLE_ROUND_TYPES.has(roundType)) {
      setBulkConfig(prev => ({ ...prev, [newRound.id]: { selected: true, count: roundType === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : 10, theme: "", difficulty: "mixed" } }));
      setBulkOpen(true);
    }
  }
  async function addManualQuestion(round: QuizRound, questionText: string, answerText: string) {
    if (!questionText.trim() || !answerText.trim()) return;
    const newQuestions = [...round.questions, { question_text: questionText.trim(), correct_answer: answerText.trim() }];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
    setManualQText(""); setManualAText("");
  }
  async function loadLibraryQuestions(roundType: string, search: string) {
    setLibraryLoading(true);
    const supabase = createSupabaseBrowserClient();
    let query = supabase.from("question_bank").select("*").eq("round_type", roundType).order("created_at", { ascending: false }).limit(25);
    if (search.trim()) query = query.ilike("question_text", "%" + search.trim() + "%");
    const { data } = await query;
    setLibraryResults((data || []) as BankQuestion[]);
    setLibraryLoading(false);
  }
  async function addLibraryQuestion(round: QuizRound, bankQ: BankQuestion) {
    const newQuestions = [...round.questions, {
      question_text: bankQ.question_text, question_type: bankQ.question_type,
      option_a: bankQ.option_a, option_b: bankQ.option_b, option_c: bankQ.option_c, option_d: bankQ.option_d,
      correct_answer: bankQ.correct_answer, difficulty: bankQ.difficulty,
    }];
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    // Remove it from the Question Library once used, same as the existing
    // "add to round" behaviour on the Question Library page itself - using a
    // question moves it into the round rather than leaving a copy sitting in
    // the library, so the library doesn't fill up with already-used items.
    await supabase.from("question_bank").delete().eq("id", bankQ.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
    setLibraryResults(prev => prev.filter(q => q.id !== bankQ.id));
  }
  async function removeRoundQuestion(round: QuizRound, qIndex: number) {
    const newQuestions = round.questions.filter((_, i) => i !== qIndex);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
  }
  // Move a question from one round to another (drag-and-drop between round
  // tabs) - removes it from the source round's questions array and appends
  // it to the target round's, persisting both rows.
  async function moveQuestionToRound(fromRound: QuizRound, qIndex: number, toRoundId: string) {
    if (fromRound.id === toRoundId) return;
    const toRound = selected?.quiz_rounds.find(r => r.id === toRoundId);
    if (!toRound) return;
    const moved = fromRound.questions[qIndex];
    if (!moved) return;
    const fromQuestions = fromRound.questions.filter((_, i) => i !== qIndex);
    const toQuestions = [...toRound.questions, moved];
    const supabase = createSupabaseBrowserClient();
    await Promise.all([
      supabase.from("quiz_rounds").update({ questions: fromQuestions }).eq("id", fromRound.id),
      supabase.from("quiz_rounds").update({ questions: toQuestions }).eq("id", toRound.id),
    ]);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : {
      ...q,
      quiz_rounds: q.quiz_rounds.map(r => {
        if (r.id === fromRound.id) return { ...r, questions: fromQuestions };
        if (r.id === toRound.id) return { ...r, questions: toQuestions };
        return r;
      }),
    }));
  }
  // Send a question you don't want in this quiz back to the reusable
  // Question Library instead of just deleting it outright.
  async function moveQuestionToLibrary(round: QuizRound, qIndex: number) {
    const q = round.questions[qIndex] as Record<string, unknown> | undefined;
    if (!q) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("question_bank").insert({
      question_text: q.question_text ?? "",
      question_type: q.question_type ?? null,
      option_a: q.option_a ?? null,
      option_b: q.option_b ?? null,
      option_c: q.option_c ?? null,
      option_d: q.option_d ?? null,
      correct_answer: q.correct_answer ?? "",
      difficulty: q.difficulty ?? round.difficulty ?? "mixed",
      round_type: round.round_type,
    });
    await removeRoundQuestion(round, qIndex);
  }
  async function syncRoundToLibrary(round: QuizRound, questions: Record<string, unknown>[], quizName: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("rounds").upsert({
      synced_from_quiz_round_id: round.id,
      folder: quizName,
      name: round.name,
      round_type: round.round_type,
      difficulty: round.difficulty,
      theme: round.theme,
      questions,
      hide_leaderboard: round.hide_leaderboard,
      allow_power_cards: round.allow_power_cards,
      points_per_question: round.points_per_question,
      danger_zone_enabled: round.danger_zone_enabled,
      danger_zone_penalty: round.danger_zone_penalty,
      max_time_bonus: round.max_time_bonus,
    }, { onConflict: "synced_from_quiz_round_id" });
  }
  async function reorderRoundQuestions(round: QuizRound, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= round.questions.length || toIndex >= round.questions.length) return;
    const newQuestions = [...round.questions];
    const [moved] = newQuestions.splice(fromIndex, 1);
    newQuestions.splice(toIndex, 0, moved);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
  }
  async function swapRoundQuestion(round: QuizRound, qIndex: number) {
    const key = round.id + "-" + qIndex;
    setSwappingKey(key);
    try {
      const cfg = bulkConfig[round.id];
      const theme = round.theme || cfg?.theme || "";
      const difficulty = round.difficulty || cfg?.difficulty || "mixed";
      // Regenerating ONE question uses the fast, local-only exclusion seed
      // (just this round's own questions) instead of the full all-time
      // history fetch - that fetch is what was making REGENERATE feel slow.
      // The permanent duplicate check still runs server-side per candidate
      // regardless, so this doesn't weaken duplicate protection.
      const exclusions = quickExclusionState(round.questions as Record<string, unknown>[]);
      const result = await generateValidatedRound(
        { roundType: round.round_type, difficulty, theme, count: 1 },
        exclusions,
      );
      if (result.questions.length === 0) {
        showToast("Couldn't generate a replacement question: " + result.finalStatus, "error", 7000);
        return;
      }
      const newQuestions = round.questions.map((q, i) => i === qIndex ? result.questions[0] : q);
      const supabase = createSupabaseBrowserClient();
      await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
      setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
      if (selected) void syncRoundToLibrary(round, newQuestions, selected.name);
    } finally {
      setSwappingKey(null);
    }
  }
  function startEditQuestion(round: QuizRound, qIndex: number, q: Record<string, unknown>) {
    const key = round.id + "-" + qIndex;
    const draft: Record<string, string> = {
      question_text: String(q.question_text ?? ""),
      correct_answer: String(q.correct_answer ?? ""),
    };
    (["a", "b", "c", "d", "e", "f"] as const).forEach(letter => {
      const v = q["option_" + letter];
      if (v != null) draft["option_" + letter] = String(v);
    });
    setEditDraft(draft);
    setEditingKey(key);
    setPhotoCandidates([]);
    setPhotoSearchError("");
  }
  async function saveEditQuestion(round: QuizRound, qIndex: number) {
    const original = round.questions[qIndex] as Record<string, unknown>;
    const updated: Record<string, unknown> = { ...original, ...editDraft };
    // Picture questions edited to point at a freshly-picked Pixabay photo (or a
    // pasted external URL) still have a hotlink at this point - re-host it in
    // our own storage now so it doesn't quietly go dead later. Already-hosted
    // blob URLs and empty values pass straight through.
    if (updated.question_type === "picture" && typeof updated.option_b === "string" && updated.option_b && !updated.option_b.includes("blob.vercel-storage.com")) {
      updated.option_b = await persistPixabayImage(updated.option_b);
    }
    const newQuestions = round.questions.map((q, i) => i === qIndex ? updated : q);
    const supabase = createSupabaseBrowserClient();
    await supabase.from("quiz_rounds").update({ questions: newQuestions }).eq("id", round.id);
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: newQuestions } : r) }));
    if (selected) void syncRoundToLibrary(round, newQuestions, selected.name);
    setEditingKey(null);
    setEditDraft({});
  }
  async function runBulkGenerate() {
    if (!selected) return;
    const targets = selected.quiz_rounds.filter(r => bulkConfig[r.id]?.selected);
    if (!targets.length) return;
    setBulkRunning(true);
    const supabase = createSupabaseBrowserClient();
    // GENERATE only ever needs to make up the SHORTFALL between what's
    // already saved in a round and the target count - previously this asked
    // for the full target count fresh every time, then wholesale REPLACED
    // the round's questions with just that new batch below. Two rounds
    // already at their target (shortfall 0) were silently wiped back down to
    // 0 if that fresh batch happened to fail entirely, and any round with
    // existing questions lost them the moment a regenerate only partially
    // succeeded. Rounds already at/above target are skipped outright.
    const shortfalls: Record<string, number> = {};
    targets.forEach(r => { shortfalls[r.id] = Math.max(0, bulkConfig[r.id].count - r.questions.length); });
    const runTargets = targets.filter(r => shortfalls[r.id] > 0);
    if (!runTargets.length) {
      setBulkRunning(false);
      showToast("Every selected round already has at least as many questions as its target count - nothing to generate. Raise a round's count in its settings to generate more.", "info", 7000);
      return;
    }
    const specs: RoundGenerationSpec[] = runTargets.map(r => ({
      roundType: r.round_type,
      difficulty: bulkConfig[r.id].difficulty,
      theme: bulkConfig[r.id].theme,
      count: shortfalls[r.id],
    }));
    // Persist the theme/difficulty each round is being generated with right
    // away, so it survives a reload and SWAP picks it back up later instead
    // of silently generating untargeted content.
    await Promise.all(runTargets.map(r => supabase.from("quiz_rounds").update({ theme: bulkConfig[r.id].theme || null, difficulty: bulkConfig[r.id].difficulty }).eq("id", r.id)));
    setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => runTargets.some(t2 => t2.id === r.id) ? { ...r, theme: bulkConfig[r.id].theme || null, difficulty: bulkConfig[r.id].difficulty } : r) }));
    setBulkProgress(Object.fromEntries(runTargets.map(r => [r.id, "Queued..."])));
    try {
      await generateAllRounds(
        specs,
        (idx, status) => {
          const round = runTargets[idx];
          setBulkProgress(prev => ({ ...prev, [round.id]: status }));
        },
        (idx, result) => {
          // Save THIS round the instant it finishes, independent of every
          // other round in the batch - a slow, crashed, or failed round
          // elsewhere can never cause an already-successful round's
          // questions to go unsaved. APPENDED to whatever the round already
          // had (spec.count above was only ever the shortfall) - a partial
          // failure now just means "got fewer new ones than hoped", never
          // "lost the ones that were already there".
          const round = runTargets[idx];
          const mergedQuestions = [...round.questions, ...result.questions];
          supabase.from("quiz_rounds").update({ questions: mergedQuestions }).eq("id", round.id).then(() => {
            setQuizzes(prev => prev.map(q => {
              if (q.id !== selected.id) return q;
              return { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: mergedQuestions } : r) };
            }));
            void syncRoundToLibrary(round, mergedQuestions, selected.name);
          });
        },
      );
    } finally {
      // Always runs, even if something above throws unexpectedly - the
      // Generate All button can never get stuck disabled again.
      setBulkRunning(false);
    }
  }

  // Lets a host top up ONE round's questions straight from that round's own
  // Questions panel - previously the only way to generate more was the
  // top-of-page "GENERATE ALL SELECTED" flow, which had no way to just
  // target one round that came up short (e.g. only 3 of a wanted 10
  // questions, per bulk-generate partially failing on that round). Reuses
  // the same generateAllRounds pipeline (permanent-history exclusion,
  // duplicate/quality checks) as a one-round batch, and always APPENDS -
  // never replaces - whatever the round already has.
  //
  // Deliberately NOT window.prompt()/window.alert() (an earlier version used
  // both) - those are native, page-blocking browser dialogs. If one opens
  // somewhere the host doesn't immediately notice, the ENTIRE page stops
  // responding to any click until it's found and dismissed, which reads as
  // "the platform froze and I can't select anything" - exactly what got
  // reported. They also pre-fill with a default ("5") that's easy to just
  // click OK/Enter past without noticing it's editable, which is almost
  // certainly why "it only ever generates 5". An inline input in the panel
  // itself avoids both problems - nothing can block the page, and the
  // number being requested is always visibly sitting right there.
  async function generateMoreForRound(round: QuizRound, requested: number) {
    // The Pursuit is always exactly 7 gates total (never host-configurable) -
    // clamp here too, not just inside generateValidatedRound, so a host
    // asking for more than the round has room for gets told plainly instead
    // of the request silently getting cut down with no explanation.
    const roomLeft = round.round_type === "pursuit" ? Math.max(0, PURSUIT_TOTAL_QUESTIONS - round.questions.length) : null;
    if (roomLeft === 0) { setGeneratingMoreStatus(`"${round.name}" already has the full ${PURSUIT_TOTAL_QUESTIONS} Pursuit gates.`); return; }
    let n = Math.max(0, Math.floor(requested));
    if (!n) return;
    const capNote = roomLeft !== null && n > roomLeft ? ` (capped to ${roomLeft} - Pursuit is always exactly ${PURSUIT_TOTAL_QUESTIONS} gates total)` : "";
    if (roomLeft !== null && n > roomLeft) n = roomLeft;
    setGeneratingMoreId(round.id);
    setGeneratingMoreStatus("Queued..." + capNote);
    // Starting a fresh run - clear any stale result message left over from a
    // previous attempt on this round so it can't be mistaken for this run's
    // outcome.
    setLastGenerateMoreResult(prev => { const next = { ...prev }; delete next[round.id]; return next; });
    const supabase = createSupabaseBrowserClient();
    const cfg = bulkConfig[round.id];
    try {
      const [result] = await generateAllRounds(
        [{ roundType: round.round_type, difficulty: cfg?.difficulty || round.difficulty || "mixed", theme: cfg?.theme ?? round.theme ?? "", count: n }],
        (_idx, status) => setGeneratingMoreStatus(status + capNote),
      );
      const mergedQuestions = [...round.questions, ...result.questions];
      await supabase.from("quiz_rounds").update({ questions: mergedQuestions }).eq("id", round.id);
      setQuizzes(prev => prev.map(q => q.id !== selected?.id ? q : { ...q, quiz_rounds: q.quiz_rounds.map(r => r.id === round.id ? { ...r, questions: mergedQuestions } : r) }));
      if (selected) void syncRoundToLibrary(round, mergedQuestions, selected.name);
      const shortfall = result.questions.length < n;
      // This used to only live in generatingMoreStatus, which is rendered
      // ONLY while generatingMoreId === this round's id - and that got
      // cleared after a flat 4s regardless of outcome, so a shortfall/failure
      // explanation (e.g. "stopped after 90s to avoid an excessive wait, got
      // 0 of 8") vanished before a host reading it after a long generation
      // run could actually see it, leaving the screen looking exactly like
      // nothing had happened. lastGenerateMoreResult persists independently
      // of the in-flight/button-disabled state until the next run starts.
      setLastGenerateMoreResult(prev => ({ ...prev, [round.id]: shortfall ? `Only generated ${result.questions.length} of ${n} requested: ${result.finalStatus}` : `Added ${result.questions.length} question${result.questions.length === 1 ? "" : "s"}.` }));
    } catch (e) {
      setLastGenerateMoreResult(prev => ({ ...prev, [round.id]: "Generation failed - please try again." + (e instanceof Error ? " (" + e.message + ")" : "") }));
    } finally {
      setGeneratingMoreId(id => id === round.id ? null : id);
      setGeneratingMoreStatus("");
    }
  }

  const load = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const [{ data: quizData, error: quizError }, { data: roundData }] = await Promise.all([
      supabase.from("quizzes").select("*, quiz_rounds(*)").order("updated_at", { ascending: false }),
      supabase.from("rounds").select("id,name,round_type,difficulty,theme,questions,hide_leaderboard,allow_power_cards,points_per_question,danger_zone_enabled,danger_zone_penalty,max_time_bonus").order("created_at", { ascending: false }),
    ]);
    if (quizError) setError("Quiz Plan Builder migration is required. " + quizError.message);
    const normalized = ((quizData ?? []) as QuizDefinition[]).map(q => ({ ...q, quiz_rounds: [...(q.quiz_rounds ?? [])].sort((a, b) => a.position - b.position) }));
    setQuizzes(normalized);
    setRounds((roundData ?? []) as LibraryRound[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Warn before closing/reloading the tab while AI generation is running.
  // Each round already saves itself to the database the instant it finishes
  // (see runBulkGenerate/generateMoreForRound below - nothing already
  // generated is ever lost by leaving), but leaving mid-run orphans the
  // in-flight request: it keeps generating in the background with no visible
  // progress, and a host who doesn't realise that and clicks GENERATE again
  // on the same round risks two overlapping runs racing to save, where
  // whichever finishes last silently wins over the other's questions. This
  // doesn't cover in-app link clicks (browsers don't allow blocking those),
  // only closing/reloading/navigating away from the site entirely - the
  // safest thing while generation is running is simply to wait for the
  // status text to finish rather than click elsewhere in the app.
  useEffect(() => {
    const generating = bulkRunning || generatingMoreId !== null;
    if (!generating) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [bulkRunning, generatingMoreId]);

  // Arriving here always used to land on the blank "+ New Quiz Plan" form
  // with nothing selected, and (coming from another page, e.g. the guided
  // duplicate flow) sometimes with the browser's scroll position stuck
  // wherever the previous page left off - between the two, the header info
  // a host actually needs was routinely off-screen or hidden behind an
  // empty create form. Reset scroll to the top on load, and once quizzes
  // are in on FIRST load only, default to the most recently updated
  // non-archived plan instead of a blank form (quizzes is already sorted by
  // updated_at desc). The "on first load only" part matters: this must not
  // re-fire every time selectedId becomes null later, or clicking
  // "+ New Quiz Plan" (which clears the selection on purpose) would get
  // silently overridden back to the last plan a heartbeat later - the
  // click would look like it simply did nothing.
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const didAutoSelectRef = useRef(false);
  useEffect(() => {
    if (loading || selectedId || guidedIntent || didAutoSelectRef.current) return;
    const mostRecent = quizzes.find(q => !q.archived);
    if (mostRecent) { didAutoSelectRef.current = true; setSelectedId(mostRecent.id); }
  }, [loading, quizzes, selectedId, guidedIntent]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const forEvent = params.get("forEvent");
      const intentParam = params.get("intent");
      // Unrecognised/hand-edited intent values are ignored entirely rather
      // than entering a half-configured guided mode with no matching button
      // labels or behaviour - falls back to the plain Quiz Library.
      const intent = VALID_INTENTS.includes(intentParam as GuidedIntent) ? (intentParam as GuidedIntent) : null;
      if (!forEvent || !intent) return;
      setGuidedIntent(intent);
      createSupabaseBrowserClient().from("events").select("event_name,event_date,start_time").eq("id", forEvent).maybeSingle().then(({ data, error: fetchError }) => {
        if (data && !fetchError) setGuidedEvent({ id: forEvent, label: `${data.event_name} · ${data.event_date} ${String(data.start_time).slice(0, 5)}` });
        setGuidedChecked(true);
      }, () => setGuidedChecked(true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Attaches quizId to the guided event WITHOUT navigating anywhere -
  // shared by assignQuizToEvent (which navigates straight back to the
  // Calendar once done, for "assign an existing complete quiz" and "create
  // a blank quiz" - both of which have nothing left to build here) and the
  // guided "duplicate" path below, which needs the copy attached but then
  // wants to STAY on this page so the host can actually build it out.
  async function attachQuizToEventSilently(quizId: string): Promise<boolean> {
    if (!guidedEvent) return false;
    setError("");
    // .select() so we can tell "updated nothing because the event vanished"
    // apart from a genuine success - a blind update matching zero rows
    // returns no error, which would otherwise silently do nothing.
    const { data: updated, error: assignError } = await createSupabaseBrowserClient().from("events").update({ quiz_definition_id: quizId, updated_at: new Date().toISOString() }).eq("id", guidedEvent.id).select("id");
    if (assignError) { setError(assignError.message); return false; }
    if (!updated?.length) { setError("This calendar event no longer exists, so the Quiz Plan couldn't be attached. It's still saved in the Quiz Library."); return false; }
    return true;
  }

  async function assignQuizToEvent(quizId: string) {
    if (!guidedEvent) return;
    setAssigning(true);
    const ok = await attachQuizToEventSilently(quizId);
    setAssigning(false);
    if (ok) window.location.assign(`/host/events?event=${guidedEvent.id}`);
  }

  const selected = quizzes.find(q => q.id === selectedId) ?? null;
  const assignableQuizzes = quizzes.filter(q => !q.archived && q.quiz_rounds.length > 0);

  async function createQuiz() {
    if (!name.trim()) return;
    setSaving(true); setError("");
    const { data, error: saveError } = await createSupabaseBrowserClient().from("quizzes").insert({ name: name.trim(), description: description.trim() || null }).select().single();
    if (saveError) { setError(saveError.message); setSaving(false); return; }
    setName(""); setDescription("");
    if (guidedIntent === "create" && guidedEvent) { await assignQuizToEvent(data.id); return; }
    await load(); setSelectedId(data.id);
    setSaving(false);
  }

  async function saveDetails() {
    if (!selected || !selected.name.trim()) return;
    setSaving(true);
    const { error: saveError } = await createSupabaseBrowserClient().from("quizzes").update({ name: selected.name.trim(), description: selected.description?.trim() || null, updated_at: new Date().toISOString() }).eq("id", selected.id);
    if (saveError) setError(saveError.message); else await load();
    setSaving(false);
  }

  async function addRound(round: LibraryRound) {
    if (!selected) return;
    const { error: saveError } = await createSupabaseBrowserClient().from("quiz_rounds").insert({ quiz_id: selected.id, source_round_id: round.id, position: selected.quiz_rounds.length, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: round.questions, hide_leaderboard: round.hide_leaderboard ?? false, allow_power_cards: round.allow_power_cards ?? true, points_per_question: round.points_per_question ?? null, danger_zone_enabled: round.danger_zone_enabled ?? false, danger_zone_penalty: round.danger_zone_penalty ?? 5, max_time_bonus: round.max_time_bonus ?? 5 });
    if (saveError) setError(saveError.message); else await load();
  }

  async function removeRound(round: QuizRound) {
    if (!selected) return;
    await createSupabaseBrowserClient().from("quiz_rounds").delete().eq("id", round.id);
    await normalizePositions(selected.id, selected.quiz_rounds.filter(r => r.id !== round.id));
    await load();
  }

  async function normalizePositions(quizId: string, ordered: QuizRound[]) {
    const supabase = createSupabaseBrowserClient();
    await Promise.all(ordered.map((round, index) => supabase.from("quiz_rounds").update({ position: index + 1000 }).eq("id", round.id).eq("quiz_id", quizId)));
    await Promise.all(ordered.map((round, index) => supabase.from("quiz_rounds").update({ position: index }).eq("id", round.id).eq("quiz_id", quizId)));
  }

  async function moveRound(index: number, direction: -1 | 1) {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.quiz_rounds.length) return;
    const ordered = [...selected.quiz_rounds];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    await normalizePositions(selected.id, ordered);
    await load();
  }

  // Drag-and-drop reorder of whole rounds (the round tabs), same pattern as
  // dragging questions within a round - drop a round tab onto another one to
  // move it there, rather than only being able to nudge it one place at a
  // time with UP/DOWN.
  async function reorderRounds(fromIndex: number, toIndex: number) {
    if (!selected || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const ordered = [...selected.quiz_rounds];
    if (fromIndex >= ordered.length || toIndex >= ordered.length) return;
    const [moved] = ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, moved);
    await normalizePositions(selected.id, ordered);
    await load();
  }

  async function duplicateRound(round: QuizRound) {
    if (!selected) return;
    const { id: _id, ...copy } = round;
    void _id;
    // Duplicating a round copies its structure/settings only, not the
    // generated questions - a copied round is a fresh template to generate
    // into, not a clone of the same quiz content.
    await createSupabaseBrowserClient().from("quiz_rounds").insert({ ...copy, questions: [], quiz_id: selected.id, position: selected.quiz_rounds.length, name: round.name + " (Copy)" });
    await load();
  }

  async function renameRound(round: QuizRound, newName: string) {
    if (!newName.trim() || newName === round.name) return;
    await createSupabaseBrowserClient().from("quiz_rounds").update({ name: newName.trim() }).eq("id", round.id);
    await load();
  }

  async function updateRoundPoints(round: QuizRound, points: number | null) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ points_per_question: points }).eq("id", round.id);
    await load();
  }

  async function updateRoundVisibility(round: QuizRound, hideLeaderboard: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ hide_leaderboard: hideLeaderboard }).eq("id", round.id);
    await load();
  }

  async function updateRoundCards(round: QuizRound, allowPowerCards: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ allow_power_cards: allowPowerCards }).eq("id", round.id);
    await load();
  }

  async function updateRoundDangerZone(round: QuizRound, enabled: boolean) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ danger_zone_enabled: enabled }).eq("id", round.id);
    await load();
  }

  async function updateRoundDangerPenalty(round: QuizRound, penalty: number) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ danger_zone_penalty: penalty }).eq("id", round.id);
    await load();
  }

  async function updateRoundMaxTimeBonus(round: QuizRound, maxTimeBonus: number) {
    await createSupabaseBrowserClient().from("quiz_rounds").update({ max_time_bonus: maxTimeBonus }).eq("id", round.id);
    await load();
  }

  async function duplicateQuiz(quiz: QuizDefinition) {
    // Guards the whole duplicate operation, not just the subsequent guided
    // assign step - without this a fast double-click could fire two inserts
    // before either finished, leaving an orphaned duplicate quiz behind.
    if (duplicating) return;
    setDuplicating(true); setError("");
    const supabase = createSupabaseBrowserClient();
    const { data, error: copyError } = await supabase.from("quizzes").insert({ name: quiz.name + " (Copy)", description: quiz.description, venue_id: quiz.venue_id, host_id: quiz.host_id }).select().single();
    if (copyError || !data) { setError(copyError?.message || "Could not duplicate quiz"); setDuplicating(false); return; }
    if (quiz.quiz_rounds.length) await supabase.from("quiz_rounds").insert(quiz.quiz_rounds.map(round => ({ quiz_id: data.id, source_round_id: round.source_round_id, position: round.position, name: round.name, round_type: round.round_type, difficulty: round.difficulty, questions: [], hide_leaderboard: round.hide_leaderboard, allow_power_cards: round.allow_power_cards, points_per_question: round.points_per_question ?? null, notes: round.notes, sponsor: round.sponsor, danger_zone_enabled: round.danger_zone_enabled ?? false, danger_zone_penalty: round.danger_zone_penalty ?? 5, max_time_bonus: round.max_time_bonus ?? 5 })));
    if (guidedIntent === "duplicate" && guidedEvent) {
      // Attach the copy to the event right away so it's linked even if the
      // host navigates off without hitting an explicit "done" - but stay on
      // this page with the new copy selected, since a fresh duplicate has
      // empty rounds (see the insert above) and is exactly what the host
      // came here to actually build, not something to be bounced away from
      // immediately after creating.
      const ok = await attachQuizToEventSilently(data.id);
      await load(); setSelectedId(data.id);
      if (ok) setGuidedAttached(true);
      setDuplicating(false);
      return;
    }
    await load(); setSelectedId(data.id);
    setDuplicating(false);
  }

  async function archiveQuiz(quiz: QuizDefinition) { await createSupabaseBrowserClient().from("quizzes").update({ archived: !quiz.archived, updated_at: new Date().toISOString() }).eq("id", quiz.id); await load(); }
  async function deleteQuiz(quiz: QuizDefinition) {
    const supabase = createSupabaseBrowserClient();
    const { count } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("quiz_definition_id", quiz.id);
    if (count) { setError("This Quiz Plan is assigned to an event. Archive it instead of deleting it."); return; }
    if (!await confirmDialog(`Delete "${quiz.name}"?`, { tone: "destructive", confirmLabel: "Delete" })) return;
    await supabase.from("quizzes").delete().eq("id", quiz.id); setSelectedId(null); await load();
  }

  return <HostShell>{confirmDialogEl}{toastEl}<main className="qi-bo-page" style={{ minHeight: "100vh", background: BG, color: "#fff" }}>
    <header className="qi-bo-pagehead" style={{ marginBottom: 10 }}><div><p style={{ margin: "0 0 2px" }}>Programme planning</p><h1 style={{ fontSize: "clamp(18px,1.6vw,22px)" }}>Quiz Library</h1></div><div className="qi-bo-page-actions">
      <div style={{ position: "relative" }}>
        <HostButton onClick={() => setPlansPanelOpen(v => !v)} style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
          {selected ? selected.name : "+ New Quiz Plan"}
          <span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>{plansPanelOpen ? "▲" : "▼"}</span>
        </HostButton>
        {plansPanelOpen && <>
          {/* Click-outside-to-close backdrop, same pattern as the Calendar
              drawer - a transparent full-screen layer under the panel. */}
          <div onClick={() => setPlansPanelOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 41, width: "min(520px, 90vw)", maxHeight: "70vh", overflowY: "auto", background: "#150A2E", border: "1px solid #2E1A52", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", padding: 8 }}>
            <button
              onClick={() => { setSelectedId(null); setPlansPanelOpen(false); }}
              style={{ display: "flex", alignItems: "center", width: "100%", textAlign: "left", gap: 8, padding: "10px 12px", borderRadius: 10, background: !selectedId ? "rgba(190,38,193,0.18)" : "transparent", border: "none", color: "#D94FDC", font: "700 13px 'Inter'", cursor: "pointer" }}
            >{!selectedId && "✓ "}+ New Quiz Plan</button>
            <div style={{ height: 1, background: "#2E1A52", margin: "6px 0" }} />
            {quizzes.filter(q => showArchivedPlans || !q.archived).map(q => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 2px", borderRadius: 10, background: q.id === selectedId ? "rgba(190,38,193,0.12)" : "transparent" }}>
                <button
                  onClick={() => { setSelectedId(q.id); setPlansPanelOpen(false); }}
                  style={{ flex: 1, minWidth: 0, textAlign: "left", padding: "8px 6px", background: "transparent", border: "none", color: q.archived ? "#6B5A8E" : "#fff", font: "600 13px 'Inter'", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={`${q.name} - ${q.quiz_rounds.length} rounds${q.archived ? " (Archived)" : ""}`}
                >{q.id === selectedId ? "✓ " : ""}{q.name}{q.archived ? " (Archived)" : ""} <span style={{ color: "#6B5A8E", fontWeight: 400 }}>- {q.quiz_rounds.length} rounds</span></button>
                <button onClick={() => archiveQuiz(q)} title={q.archived ? "Restore" : "Archive"} style={{ flexShrink: 0, padding: "6px 8px", borderRadius: 8, background: "transparent", border: "1px solid #2E1A52", color: "#B9A8D9", font: "600 10px 'Inter'", cursor: "pointer" }}>{q.archived ? "RESTORE" : "ARCHIVE"}</button>
                <button onClick={() => deleteQuiz(q)} title="Delete" style={{ flexShrink: 0, padding: "6px 8px", borderRadius: 8, background: "transparent", border: "1px solid rgba(255,112,112,0.4)", color: "#FF7070", font: "600 10px 'Inter'", cursor: "pointer" }}>DELETE</button>
              </div>
            ))}
            {quizzes.some(q => q.archived) && (
              <button onClick={() => setShowArchivedPlans(v => !v)} style={{ width: "100%", textAlign: "center", marginTop: 6, padding: "8px 6px", background: "transparent", border: "none", color: "#6B5A8E", font: "600 11px 'Inter'", cursor: "pointer" }}>
                {showArchivedPlans ? "Hide archived plans" : `Show ${quizzes.filter(q => q.archived).length} archived plan${quizzes.filter(q => q.archived).length === 1 ? "" : "s"}`}
              </button>
            )}
          </div>
        </>}
      </div>
      <Link className="fbh-btn" href="/host/rounds">Round Library</Link><Link className="fbh-btn pri" href="/host/session">Open Live Session</Link></div></header>
    {guidedIntent&&guidedEvent&&<section className="fbh-panel" role="status" style={{marginBottom:16,borderColor: guidedAttached ? "#2EE06E" : "#BE26C1"}}>
      <strong style={{display:"block",marginBottom:4}}>
        {guidedIntent==="create"&&"Create a new Quiz Plan for this event"}
        {guidedIntent==="duplicate"&&(guidedAttached ? "Copy attached - now build it out" : "Duplicate an existing Quiz Plan for this event")}
        {guidedIntent==="assign"&&"Assign an existing Quiz Plan to this event"}
      </strong>
      <span style={{color:"#B9A8D9",fontSize:13}}>
        {guidedEvent.label}
        {guidedIntent==="create"&&" · Fill in the Quiz Plan on the left and create it - it'll be attached automatically."}
        {guidedIntent==="duplicate"&&!guidedAttached&&" · Select a Quiz Plan on the left, then use Duplicate Quiz Plan - the copy is attached automatically."}
        {guidedIntent==="duplicate"&&guidedAttached&&" · The copy is already linked to this event. Add rounds/questions below, then come back here when you're done."}
        {guidedIntent==="assign"&&" · Pick a Quiz Plan below to attach it immediately."}
        {assigning&&" · Assigning…"}
      </span>
      <div style={{marginTop:8}}><Link href={`/host/events?event=${guidedEvent.id}`} className="fbh-btn pri">{guidedAttached ? "DONE · BACK TO EVENT" : "CANCEL · BACK TO EVENT"}</Link></div>
    </section>}
    {guidedIntent&&guidedChecked&&!guidedEvent&&<section className="fbh-panel" role="alert" style={{marginBottom:16,borderColor:"#FF7070"}}>
      <strong style={{display:"block",marginBottom:4,color:"#FF8290"}}>This calendar event could not be found</strong>
      <span style={{color:"#B9A8D9",fontSize:13}}>It may have been deleted or the link may be out of date. You can still create or manage Quiz Plans below, but nothing will be attached automatically.</span>
      <div style={{marginTop:8}}><Link href="/host/events" className="fbh-btn">BACK TO CALENDAR</Link></div>
    </section>}
    {loading ? <HostLoading title="Quiz Library" note="Loading Quiz Plans and rounds…" /> : error && !quizzes.length ? <section className="qi-bo-setup-state" role="alert"><span>Setup required</span><h2>Quiz Library is not available yet</h2><p>The existing Quiz Builder database migration must be applied before Quiz Plans can be created. No data has been changed.</p><details><summary>Technical detail</summary><code>{error}</code></details></section> : <div className="qi-quiz-builder-grid" style={{ display: "block", maxWidth: "none" }}>

      <section className="fbh-panel" style={{ width: "100%" }}>{!selected ? (
        <div style={{ maxWidth: 480 }}>
          <HostInput value={name} onChange={e => setName(e.target.value)} placeholder="Thursday Night Quiz" />
          <HostLabel>Description</HostLabel>
          <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} className="fbh-input" style={{ width: "100%" }} />
          <HostButton variant="pri" onClick={createQuiz} disabled={!name.trim() || saving || assigning} style={{ width: "100%", marginTop: 10 }}>{guidedIntent === "create" ? "CREATE & ASSIGN TO EVENT" : "CREATE QUIZ PLAN"}</HostButton>
          {quizzes.length > 0 && <p style={{ color: "#6B5A8E", font: "400 12px 'Inter'", marginTop: 16 }}>Or pick an existing plan from the dropdown above.</p>}
        </div>
      ) : <>
        <HostLabel>Quiz Name</HostLabel><HostInput value={selected.name} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, name: e.target.value } : q))} /><HostLabel>Description</HostLabel><textarea value={selected.description || ""} onChange={e => setQuizzes(prev => prev.map(q => q.id === selected.id ? { ...q, description: e.target.value } : q))} rows={2} className="fbh-input" style={{ width: "100%" }} />
        <div style={{ display: "flex", gap: 8, margin: "12px 0 20px", flexWrap: "wrap" }}>{guidedIntent === "duplicate" && !guidedAttached ? <HostButton variant="pri" onClick={() => duplicateQuiz(selected)} disabled={assigning || duplicating}>{duplicating ? "DUPLICATING…" : "DUPLICATE & USE FOR THIS EVENT"}</HostButton> : guidedIntent === "assign" && guidedEvent ? <HostButton variant="pri" onClick={() => assignQuizToEvent(selected.id)} disabled={assigning}>{assigning ? "ATTACHING…" : "USE THIS QUIZ PLAN FOR THIS EVENT"}</HostButton> : <><HostButton variant="pri" onClick={saveDetails} disabled={saving}>SAVE QUIZ PLAN</HostButton><HostButton onClick={() => duplicateQuiz(selected)} disabled={duplicating}>{duplicating ? "DUPLICATING…" : "DUPLICATE QUIZ PLAN"}</HostButton><HostButton onClick={() => archiveQuiz(selected)}>{selected.archived ? "RESTORE" : "ARCHIVE"}</HostButton><HostButton onClick={() => deleteQuiz(selected)}>DELETE</HostButton></>}</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div className="fbh-lbl" style={{ margin: 0 }}>Rounds</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <HostButton variant="pri" onClick={() => setAddRoundOpen(v => !v)}>{addRoundOpen ? "CLOSE" : "+ ADD ROUND"}</HostButton>
              <HostButton
                onClick={() => setBulkConfig(prev => {
                  const next = { ...prev };
                  selected.quiz_rounds.filter(r => GENERATABLE_ROUND_TYPES.has(r.round_type)).forEach(r => {
                    next[r.id] = { selected: true, count: r.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (prev[r.id]?.count || r.target_count || r.questions.length || 10), theme: prev[r.id]?.theme ?? "", difficulty: prev[r.id]?.difficulty ?? "mixed" };
                  });
                  return next;
                })}
                disabled={bulkRunning}
              >SELECT ALL ROUNDS</HostButton>
              <HostButton onClick={runBulkGenerate} disabled={bulkRunning || !selected.quiz_rounds.some(r => (bulkConfig[r.id] ?? { selected: false }).selected)}>
                {bulkRunning ? "GENERATING..." : "GENERATE ALL SELECTED"}
              </HostButton>
            </div>
          </div>
          {addRoundOpen && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52", display: "grid", gap: 10 }}>
              <div>
                <div style={{ color: "#B9A8D9", font: "600 12px 'Inter'", marginBottom: 6 }}>GENERATE A NEW ROUND WITH AI</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(ROUND_TYPE_LABELS).map(([rt, label]) => (
                    <HostButton key={rt} onClick={() => { addBlankRoundSlot(rt); setAddRoundOpen(false); }}>{label}</HostButton>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "#B9A8D9", font: "600 12px 'Inter'", marginBottom: 6 }}>OR PICK AN EXISTING ROUND FROM THE LIBRARY</div>
                <select value={roundTypeFilter} onChange={e => setRoundTypeFilter(e.target.value)} style={{ marginBottom: 8, minHeight: 40, padding: "0 10px", borderRadius: 8, background: "#0A0118", color: "#fff", border: "1px solid #2E1A52", font: "500 13px 'Inter'" }}>
                  <option value="">All round types</option>
                  {Array.from(new Set(rounds.map(r => r.round_type))).sort().map(rt => <option key={rt} value={rt}>{rt}</option>)}
                </select>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 8, maxHeight: 260, overflowY: "auto" }}>{rounds
                  .filter(r => !roundTypeFilter || r.round_type === roundTypeFilter)
                  .map(round => ({ round, added: selected.quiz_rounds.some(qr => qr.source_round_id === round.id) }))
                  .sort((a, b) => Number(a.added) - Number(b.added))
                  .map(({ round, added }) => (
                    <button key={round.id} onClick={() => { addRound(round); setAddRoundOpen(false); }} className="qi-mc-round-card" style={added ? { borderColor: "#2EE06E", background: "rgba(46,224,110,0.08)", opacity: 0.6 } : undefined}>
                      <strong>{added ? "Added: " : ""}{round.name}</strong>
                      <span style={{ display: "block", color: "#6B5A8E", font: "400 11px 'Inter'" }}>{round.questions.length} questions - {round.round_type}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {!selected.quiz_rounds.length ? (
          <div style={{ color: "#B9A8D9", padding: 16 }}>Add the first round using &quot;+ ADD ROUND&quot; above.</div>
        ) : (() => {
          const activeRound = selected.quiz_rounds.find(r => r.id === activeRoundId) || selected.quiz_rounds[0];
          const activeIndex = selected.quiz_rounds.findIndex(r => r.id === activeRound.id);
          const isGeneratable = GENERATABLE_ROUND_TYPES.has(activeRound.round_type);
          const cfg = bulkConfig[activeRound.id] ?? { selected: false, count: activeRound.round_type === "pursuit" ? PURSUIT_TOTAL_QUESTIONS : (activeRound.target_count || activeRound.questions.length || 10), theme: activeRound.theme ?? "", difficulty: activeRound.difficulty || "mixed" };
          const progress = bulkProgress[activeRound.id];
          const settingsOpen = settingsOpenRoundId === activeRound.id;
          const addQuestionOpen = addQuestionOpenId === activeRound.id;
          return (
            <>
              {/* One tab per round - the whole quiz at a glance, click a tab to work on just that round's questions.
                  Sticks below the site header so it stays reachable as a drag-and-drop target while scrolling
                  through a long list of questions, instead of scrolling out of view. */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, position: "sticky", top: 96, zIndex: 20, padding: "8px 8px", margin: "-8px -8px 6px", background: "rgba(10,1,24,0.92)", backdropFilter: "blur(10px)", borderRadius: 12 }}>
                {selected.quiz_rounds.map((round, index) => {
                  const isRoundGeneratable = GENERATABLE_ROUND_TYPES.has(round.round_type);
                  const roundCfg = bulkConfig[round.id];
                  const roundProgress = bulkProgress[round.id];
                  // A tab is a drop target either for a dragged QUESTION (moving it into
                  // a different round) or for a dragged ROUND tab itself (reordering the
                  // rounds) - the two never happen at the same time, so they share the
                  // same highlight state.
                  const isQuestionDropTarget = Boolean(draggedQuestionSource) && draggedQuestionSource!.roundId !== round.id;
                  const isRoundDropTarget = draggedRoundIndex !== null && draggedRoundIndex !== index;
                  const isDropTarget = isQuestionDropTarget || isRoundDropTarget;
                  return (
                  <div
                    key={round.id}
                    draggable
                    onClick={() => setActiveRoundId(round.id)}
                    onDragStart={e => { e.stopPropagation(); setDraggedRoundIndex(index); }}
                    onDragOver={e => { if (isDropTarget) { e.preventDefault(); if (dragOverRoundId !== round.id) setDragOverRoundId(round.id); } }}
                    onDragLeave={() => setDragOverRoundId(cur => cur === round.id ? null : cur)}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedQuestionSource && isQuestionDropTarget) {
                        const fromRound = selected.quiz_rounds.find(r => r.id === draggedQuestionSource.roundId);
                        if (fromRound) void moveQuestionToRound(fromRound, draggedQuestionSource.index, round.id);
                      } else if (draggedRoundIndex !== null && isRoundDropTarget) {
                        void reorderRounds(draggedRoundIndex, index);
                      }
                      setDraggedQuestionSource(null);
                      setDraggedRoundIndex(null);
                      setDragOverRoundId(null);
                    }}
                    onDragEnd={() => { setDraggedRoundIndex(null); setDragOverRoundId(null); }}
                    style={{
                      padding: "8px 14px", borderRadius: 10, cursor: "grab", textAlign: "left",
                      border: dragOverRoundId === round.id ? "2px dashed #2EE06E" : round.id === activeRound.id ? "2px solid #BE26C1" : "1px solid #2E1A52",
                      background: dragOverRoundId === round.id ? "rgba(46,224,110,0.12)" : round.id === activeRound.id ? "rgba(190,38,193,0.15)" : "#150A2E",
                      opacity: draggedRoundIndex === index ? 0.4 : 1,
                      color: "#fff", display: "flex", flexDirection: "column", gap: 2,
                      // Fixed width + clipped status line so a round that's
                      // hit a long "stalled after 25 questions..." message
                      // stays the same compact rectangle as every other
                      // round tab instead of stretching full-width and
                      // pushing the actual question cards below off screen.
                      width: 220, flexShrink: 0,
                    }}
                  >
                    {isRoundGeneratable && (
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "600 11px 'Inter'", color: "#B9A8D9" }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={roundCfg?.selected ?? false} onChange={e => updateBulkConfig(round.id, { selected: e.target.checked })} />
                        Include in Generate All
                      </label>
                    )}
                    <span style={{ font: "700 13px 'Inter'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{index + 1}. {round.name}</span>
                    {roundProgress && <span title={roundProgress} style={{ color: "#2EE06E", font: "600 11px 'Inter'", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roundProgress}</span>}
                    <span style={{ color: "#6B5A8E", font: "400 11px 'Inter'" }}>{round.questions.length} Q - {round.round_type}</span>
                    {/* A round with audio questions still needs each one's
                        actual clip saved in Music Prep before the quiz can go
                        live - previously the only way to notice this was to
                        open every round and check, or find out live on the
                        night. Surfacing it right on the tab means a host
                        scanning the round list can see at a glance which
                        rounds still need attention. */}
                    {round.questions.some(q => (q as Record<string, unknown>).question_type === "audio") && !roundMusicIsPrepped(round) && (
                      <span title="One or more audio questions in this round have no saved clip yet - open Music Prep before this quiz can go live" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#FFC533", font: "700 10px 'Inter'", letterSpacing: ".04em" }}>⚠ MUSIC NOT PREPPED</span>
                    )}
                  </div>
                  );
                })}
                {draggedQuestionSource && (
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverLibrary(true); }}
                    onDragLeave={() => setDragOverLibrary(false)}
                    onDrop={e => {
                      e.preventDefault();
                      const fromRound = selected.quiz_rounds.find(r => r.id === draggedQuestionSource.roundId);
                      if (fromRound) void moveQuestionToLibrary(fromRound, draggedQuestionSource.index);
                      setDraggedQuestionSource(null);
                      setDragOverLibrary(false);
                    }}
                    style={{
                      padding: "8px 14px", borderRadius: 10, textAlign: "center", alignSelf: "center",
                      border: dragOverLibrary ? "2px dashed #2EE06E" : "1px dashed #6B5A8E",
                      background: dragOverLibrary ? "rgba(46,224,110,0.12)" : "transparent",
                      color: dragOverLibrary ? "#2EE06E" : "#6B5A8E", font: "600 12px 'Inter'",
                    }}
                  >
                    Drop here to send to Question Library
                  </div>
                )}
              </div>

              <div className="fbh-panel" style={{ padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span className="ord">{activeIndex + 1}</span>
                  <input
                    key={activeRound.id}
                    defaultValue={activeRound.name}
                    onBlur={e => renameRound(activeRound, e.target.value)}
                    style={{ flex: 1, minWidth: 0, background: "transparent", border: "1px solid transparent", borderBottom: "1px solid #2E1A52", color: "#fff", font: "700 16px 'Inter'", padding: "4px 2px" }}
                  />
                </div>
                <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'", marginBottom: 12 }}>{activeRound.questions.length} questions - {activeRound.round_type}</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  <HostButton onClick={() => setSettingsOpenRoundId(id => id === activeRound.id ? null : activeRound.id)}>{settingsOpen ? "HIDE SETTINGS" : "SETTINGS"}</HostButton>
                  <HostButton onClick={() => moveRound(activeIndex, -1)} disabled={activeIndex === 0}>UP</HostButton>
                  <HostButton onClick={() => moveRound(activeIndex, 1)} disabled={activeIndex === selected.quiz_rounds.length - 1}>DOWN</HostButton>
                  <HostButton onClick={() => duplicateRound(activeRound)}>COPY</HostButton>
                  <HostButton onClick={() => removeRound(activeRound)}>REMOVE</HostButton>
                  {activeRound.questions.some(q => (q as Record<string, unknown>).question_type === "audio") && (
                    <a className="fbh-btn" href={`/host/music-prep?round=${activeRound.id}`} title="Search, trim and save the actual audio clips for this round's music questions">PREP MUSIC</a>
                  )}
                </div>

                {settingsOpen && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 12, padding: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Points per Q
                        <input
                          type="number"
                          defaultValue={activeRound.points_per_question ?? ""}
                          placeholder="Default"
                          onBlur={e => updateRoundPoints(activeRound, e.target.value === "" ? null : Number(e.target.value))}
                          style={{ width: 100, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Show leaderboard
                        <Toggle on={!activeRound.hide_leaderboard} onClick={() => updateRoundVisibility(activeRound, !activeRound.hide_leaderboard)} />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Power cards
                        <Toggle on={activeRound.allow_power_cards} onClick={() => updateRoundCards(activeRound, !activeRound.allow_power_cards)} />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Danger Zone
                        <Toggle on={activeRound.danger_zone_enabled} onClick={() => updateRoundDangerZone(activeRound, !activeRound.danger_zone_enabled)} />
                      </label>
                      {activeRound.danger_zone_enabled && (
                        <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                          Penalty
                          <input
                            type="number"
                            defaultValue={activeRound.danger_zone_penalty ?? 5}
                            onBlur={e => updateRoundDangerPenalty(activeRound, Number(e.target.value) || 0)}
                            style={{ width: 56, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}
                          />
                        </label>
                      )}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                        Max time bonus
                        <input
                          type="number"
                          defaultValue={activeRound.max_time_bonus ?? 5}
                          onBlur={e => updateRoundMaxTimeBonus(activeRound, Number(e.target.value) || 0)}
                          style={{ width: 56, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}
                        />
                      </label>
                    </div>
                    {isGeneratable && (
                      <div style={{ display: "grid", gap: 8, padding: 10, marginBottom: 12, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13px 'Inter'", color: "#fff" }}>
                          <input type="checkbox" checked={cfg.selected} onChange={e => updateBulkConfig(activeRound.id, { selected: e.target.checked })} />
                          Include in Generate All
                        </label>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Questions
                            {activeRound.round_type === "pursuit"
                              ? <span style={{ color: "#fff" }}>7 (fixed)</span>
                              : <input type="number" value={cfg.count} onChange={e => updateBulkConfig(activeRound.id, { count: Number(e.target.value) || 0 })} style={{ width: 64, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }} />}
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Theme
                            <input type="text" value={cfg.theme} onChange={e => updateBulkConfig(activeRound.id, { theme: e.target.value })} placeholder="e.g. showbiz, music, 90s" style={{ width: 140, padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }} />
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, font: "400 13px 'Inter'", color: "#B9A8D9" }}>
                            Difficulty
                            <select value={cfg.difficulty} onChange={e => updateBulkConfig(activeRound.id, { difficulty: e.target.value })} style={{ padding: "6px 8px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff" }}>
                              <option value="easy">Easy</option>
                              <option value="mixed">Mixed</option>
                              <option value="hard">Hard</option>
                            </select>
                          </label>
                        </div>
                        {progress && <div style={{ font: "400 12px 'Inter'", color: "#2EE06E" }}>{progress}</div>}
                      </div>
                    )}
                  </>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6, marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <div className="fbh-lbl" style={{ margin: 0 }}>Questions</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {generatingMoreId === activeRound.id && <span style={{ font: "600 11px 'Inter'", color: "#B9A8D9" }}>{generatingMoreStatus}</span>}
                    {generatingMoreId !== activeRound.id && lastGenerateMoreResult[activeRound.id] && <span style={{ font: "600 11px 'Inter'", color: "#B9A8D9" }}>{lastGenerateMoreResult[activeRound.id]}</span>}
                    {isGeneratable && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="number"
                          min={1}
                          aria-label="How many more questions to generate"
                          value={generateMoreCounts[activeRound.id] ?? 5}
                          onChange={e => setGenerateMoreCounts(prev => ({ ...prev, [activeRound.id]: Math.max(1, Math.floor(Number(e.target.value)) || 1) }))}
                          disabled={generatingMoreId === activeRound.id}
                          style={{ width: 48, padding: "8px 6px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52", color: "#fff", textAlign: "center" as const }}
                        />
                        <HostButton onClick={() => generateMoreForRound(activeRound, generateMoreCounts[activeRound.id] ?? 5)} disabled={generatingMoreId === activeRound.id}>
                          {generatingMoreId === activeRound.id ? "GENERATING..." : "+ GENERATE WITH AI"}
                        </HostButton>
                      </div>
                    )}
                    <HostButton onClick={() => { setLibraryOpenId(id => { const next = id === activeRound.id ? null : activeRound.id; if (next) { setLibrarySearch(""); loadLibraryQuestions(activeRound.round_type, ""); } return next; }); setAddQuestionOpenId(null); }}>{libraryOpenId === activeRound.id ? "CLOSE" : "+ FROM LIBRARY"}</HostButton>
                    <HostButton onClick={() => { setAddQuestionOpenId(id => id === activeRound.id ? null : activeRound.id); setLibraryOpenId(null); }}>{addQuestionOpen ? "CLOSE" : "+ ADD QUESTION"}</HostButton>
                  </div>
                </div>
                {libraryOpenId === activeRound.id && (
                  <div style={{ display: "grid", gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                    <input
                      value={librarySearch}
                      onChange={e => { setLibrarySearch(e.target.value); loadLibraryQuestions(activeRound.round_type, e.target.value); }}
                      placeholder={"Search " + activeRound.round_type + " questions..."}
                      className="fbh-input"
                      style={{ width: "100%" }}
                    />
                    {libraryLoading && <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'" }}>Searching...</div>}
                    {!libraryLoading && libraryResults.length === 0 && <div style={{ color: "#6B5A8E", font: "400 12px 'Inter'" }}>No saved {activeRound.round_type} questions found in the Question Library.</div>}
                    <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
                      {libraryResults.map(bq => (
                        <div key={bq.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 8, background: "#0A0118", border: "1px solid #2E1A52" }}>
                          <div style={{ font: "400 12px 'Inter'", color: "#D9CCF2" }}>{bq.question_text} <span style={{ color: "#2EE06E" }}>{"-> " + bq.correct_answer}</span></div>
                          <HostButton onClick={() => addLibraryQuestion(activeRound, bq)} style={{ padding: "4px 10px", height: 28, fontSize: 12, flexShrink: 0 }}>ADD</HostButton>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {addQuestionOpen && (
                  <div style={{ display: "grid", gap: 8, padding: 12, marginBottom: 14, borderRadius: 10, background: "#150A2E", border: "1px solid #2E1A52" }}>
                    <input value={manualQText} onChange={e => setManualQText(e.target.value)} placeholder="Question" className="fbh-input" style={{ width: "100%" }} />
                    <input value={manualAText} onChange={e => setManualAText(e.target.value)} placeholder="Answer" className="fbh-input" style={{ width: "100%" }} />
                    <HostButton variant="pri" onClick={() => addManualQuestion(activeRound, manualQText, manualAText)} disabled={!manualQText.trim() || !manualAText.trim()}>ADD QUESTION</HostButton>
                  </div>
                )}

                {activeRound.questions.length === 0 && <p style={{ color: "#6B5A8E", font: "400 12px 'Inter'", margin: 0 }}>No questions in this round yet.</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                  {activeRound.questions.map((q, qi) => {
                    const swapKey = activeRound.id + "-" + qi;
                    const isSwapping = swappingKey === swapKey;
                    const qr = q as Record<string, unknown>;
                    const qType = String(qr.question_type ?? "");
                    const correctAnswer = String(qr.correct_answer ?? "");
                    // Full option list (a-f, whichever exist) - previously only
                    // the correct answer was shown, so there was no way to
                    // review a multiple-choice/sequence question's wrong
                    // options before it went live.
                    // Audio (music) questions hide the real search info from
                    // players in option_a - that's exactly the field a host
                    // needs to see to go find/cue up the actual track before
                    // the show, so surface it explicitly here.
                    const isAudio = qType === "audio";
                    const musicLookup = isAudio ? String(qr.option_a ?? "") : "";
                    // Picture questions store the internal search query in
                    // option_a and the actual fetched image URL in option_b -
                    // neither is a real multiple-choice option, so both need
                    // to be pulled out of the generic options list and shown
                    // as an actual photo instead of raw text/a URL string.
                    const isPicture = qType === "picture";
                    const photoQuery = isPicture ? String(qr.option_a ?? "") : "";
                    const photoUrl = isPicture ? String(qr.option_b ?? "") : "";
                    const optionLetters = ["a", "b", "c", "d", "e", "f"] as const;
                    const options = optionLetters
                      .map(letter => ({ letter, value: qr["option_" + letter] as string | null | undefined }))
                      .filter(o => o.value)
                      .filter(o => !((isAudio || isPicture) && (o.letter === "a" || o.letter === "b")));
                    const editKey = activeRound.id + "-" + qi;
                    const isEditing = editingKey === editKey;
                    return (
                      <div
                        key={qi}
                        draggable={!isEditing}
                        onDragStart={() => { setDraggedQuestionIndex(qi); setDraggedQuestionSource({ roundId: activeRound.id, index: qi }); }}
                        onDragOver={e => { e.preventDefault(); if (dragOverQuestionIndex !== qi) setDragOverQuestionIndex(qi); }}
                        onDragLeave={() => setDragOverQuestionIndex(cur => cur === qi ? null : cur)}
                        onDrop={e => {
                          e.preventDefault();
                          if (draggedQuestionIndex !== null) reorderRoundQuestions(activeRound, draggedQuestionIndex, qi);
                          setDraggedQuestionIndex(null);
                          setDragOverQuestionIndex(null);
                          setDraggedQuestionSource(null);
                        }}
                        onDragEnd={() => { setDraggedQuestionIndex(null); setDragOverQuestionIndex(null); setDraggedQuestionSource(null); }}
                        style={{
                          position: "relative", padding: "12px 34px 12px 14px", borderRadius: 12, background: "#150A2E",
                          border: dragOverQuestionIndex === qi && draggedQuestionIndex !== qi ? "1px dashed #BE26C1" : "1px solid #2E1A52",
                          opacity: draggedQuestionIndex === qi ? 0.4 : 1,
                          cursor: "grab",
                        }}
                      >
                        <button
                          onClick={() => removeRoundQuestion(activeRound, qi)}
                          title="Remove question"
                          style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer", fontSize: 14, lineHeight: "22px", padding: 0 }}
                        >×</button>
                        {isEditing ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <textarea
                              value={editDraft.question_text ?? ""}
                              onChange={e => setEditDraft(d => ({ ...d, question_text: e.target.value }))}
                              className="fbh-input"
                              rows={2}
                              style={{ width: "100%", resize: "vertical", font: "400 13px 'Inter'" }}
                              placeholder="Question"
                            />
                            {isAudio ? (
                              <div>
                                <div style={{ color: "#D94FDC", font: "700 10px 'Inter'", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Search to find this track</div>
                                <input
                                  value={editDraft.option_a ?? ""}
                                  onChange={e => setEditDraft(d => ({ ...d, option_a: e.target.value }))}
                                  className="fbh-input"
                                  style={{ width: "100%", font: "400 12px 'Inter'" }}
                                />
                              </div>
                            ) : isPicture ? (
                              <div>
                                {editDraft.option_b && <img src={getMediaUrl(editDraft.option_b) ?? undefined} alt={editDraft.option_a || "Question photo"} style={{ display: "block", width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 6, marginBottom: 6 }} />}
                                <div style={{ color: "#D94FDC", font: "700 10px 'Inter'", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Image search query</div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input
                                    value={editDraft.option_a ?? ""}
                                    onChange={e => setEditDraft(d => ({ ...d, option_a: e.target.value }))}
                                    className="fbh-input"
                                    style={{ flex: 1, font: "400 12px 'Inter'" }}
                                    placeholder="e.g. Eiffel Tower Paris"
                                  />
                                  <HostButton type="button" onClick={() => searchPhotos(editDraft.option_a ?? "")} disabled={photoSearching || !(editDraft.option_a ?? "").trim()} style={{ padding: "0 12px", height: 34, fontSize: 11, flexShrink: 0 }}>
                                    {photoSearching ? "SEARCHING..." : "SEARCH"}
                                  </HostButton>
                                </div>
                                <div style={{ color: "#6B5A8E", font: "400 10px 'Inter'", marginTop: 4 }}>Edit the query above and hit SEARCH to browse real photo options and pick one directly.</div>
                                {photoSearchError && <div style={{ color: "#FF8290", font: "400 11px 'Inter'", marginTop: 4 }}>{photoSearchError}</div>}
                                {photoCandidates.length > 0 && (
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
                                    {photoCandidates.map(c => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { setEditDraft(d => ({ ...d, option_b: c.full })); setPhotoCandidates([]); }}
                                        title={c.tags}
                                        style={{
                                          padding: 0, border: editDraft.option_b === c.full ? "2px solid #2EE06E" : "1px solid #2E1A52",
                                          borderRadius: 6, overflow: "hidden", cursor: "pointer", background: "none", height: 64,
                                        }}
                                      >
                                        <img src={c.thumb} alt={c.tags} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <input
                                  value={editDraft.option_b ?? ""}
                                  onChange={e => setEditDraft(d => ({ ...d, option_b: e.target.value }))}
                                  className="fbh-input"
                                  style={{ width: "100%", font: "400 12px 'Inter'", marginTop: 6 }}
                                  placeholder="Or paste a direct image URL"
                                />
                                <div style={{ marginTop: 6 }}>
                                  <div style={{ color: "#B9A8D9", font: "700 10px 'Inter'", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 3 }}>Correct answer</div>
                                  <input
                                    value={editDraft.correct_answer ?? ""}
                                    onChange={e => setEditDraft(d => ({ ...d, correct_answer: e.target.value }))}
                                    className="fbh-input"
                                    style={{ width: "100%", font: "400 12px 'Inter'" }}
                                  />
                                </div>
                              </div>
                            ) : options.length > 0 ? (
                              <div style={{ display: "grid", gap: 4 }}>
                                {options.map(o => (
                                  <div key={o.letter} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => setEditDraft(d => ({ ...d, correct_answer: o.letter }))}
                                      title="Mark as correct answer"
                                      style={{
                                        width: 22, height: 22, flexShrink: 0, borderRadius: "50%", cursor: "pointer",
                                        border: (editDraft.correct_answer ?? "").toLowerCase() === o.letter ? "2px solid #2EE06E" : "1px solid #6B5A8E",
                                        background: (editDraft.correct_answer ?? "").toLowerCase() === o.letter ? "rgba(46,224,110,0.2)" : "transparent",
                                        color: (editDraft.correct_answer ?? "").toLowerCase() === o.letter ? "#2EE06E" : "#6B5A8E",
                                        font: "700 11px 'Inter'",
                                      }}
                                    >{o.letter.toUpperCase()}</button>
                                    <input
                                      value={editDraft["option_" + o.letter] ?? ""}
                                      onChange={e => setEditDraft(d => ({ ...d, ["option_" + o.letter]: e.target.value }))}
                                      className="fbh-input"
                                      style={{ flex: 1, font: "400 12px 'Inter'" }}
                                    />
                                  </div>
                                ))}
                                <div style={{ color: "#6B5A8E", font: "400 10px 'Inter'" }}>Tap a letter to set the correct answer</div>
                              </div>
                            ) : (
                              <input
                                value={editDraft.correct_answer ?? ""}
                                onChange={e => setEditDraft(d => ({ ...d, correct_answer: e.target.value }))}
                                className="fbh-input"
                                style={{ width: "100%", font: "400 12px 'Inter'" }}
                                placeholder="Correct answer"
                              />
                            )}
                            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                              <HostButton variant="pri" onClick={() => saveEditQuestion(activeRound, qi)} style={{ padding: "4px 10px", height: 26, fontSize: 11 }}>SAVE</HostButton>
                              <HostButton onClick={() => { setEditingKey(null); setEditDraft({}); setPhotoCandidates([]); }} style={{ padding: "4px 10px", height: 26, fontSize: 11 }}>CANCEL</HostButton>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ font: "400 13px 'Inter'", color: "#D9CCF2", lineHeight: 1.5 }}>
                              <strong style={{ color: "#6B5A8E" }}>{"⠿ "}{qi + 1}.</strong> {String(qr.question_text ?? "")}
                            </div>
                            {isAudio && musicLookup && (
                              <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 8, background: "rgba(190,38,193,0.12)", border: "1px solid rgba(190,38,193,0.4)" }}>
                                <div style={{ color: "#D94FDC", font: "700 10px 'Inter'", textTransform: "uppercase", letterSpacing: ".06em" }}>Search to find this track</div>
                                <div style={{ color: "#fff", font: "600 12px 'Inter'", marginTop: 2 }}>{musicLookup}</div>
                              </div>
                            )}
                            {isPicture && (
                              <div style={{ marginTop: 6, padding: "6px 8px", borderRadius: 8, background: "rgba(190,38,193,0.12)", border: "1px solid rgba(190,38,193,0.4)" }}>
                                <div style={{ color: "#D94FDC", font: "700 10px 'Inter'", textTransform: "uppercase", letterSpacing: ".06em" }}>Photo shown to players</div>
                                {photoUrl ? (
                                  <img src={getMediaUrl(photoUrl) ?? undefined} alt={photoQuery || "Question photo"} style={{ display: "block", width: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 6, marginTop: 6 }} />
                                ) : (
                                  <div style={{ color: "#B9A8D9", font: "400 12px 'Inter'", marginTop: 4 }}>No image found for this question yet.</div>
                                )}
                                {photoQuery && <div style={{ color: "#6B5A8E", font: "400 11px 'Inter'", marginTop: 4 }}>{"Search: " + photoQuery}</div>}
                              </div>
                            )}
                            {options.length > 0 ? (
                              <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                                {options.map(o => (
                                  <div key={o.letter} style={{ font: "400 12px 'Inter'", color: correctAnswer.toLowerCase().includes(o.letter) || correctAnswer === o.value ? "#2EE06E" : "#B9A8D9" }}>
                                    {o.letter.toUpperCase()}. {o.value}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div style={{ color: "#2EE06E", font: "600 12px 'Inter'", marginTop: 6 }}>{"-> "}{correctAnswer}</div>
                            )}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                              <HostButton onClick={() => startEditQuestion(activeRound, qi, qr)} title="Edit this question" style={{ padding: "4px 10px", height: 26, fontSize: 11 }}>EDIT</HostButton>
                              <HostButton onClick={() => swapRoundQuestion(activeRound, qi)} disabled={isSwapping} title="Replace with a new AI-generated question" style={{ padding: "4px 10px", height: 26, fontSize: 11 }}>{isSwapping ? "REGENERATING..." : "REGENERATE"}</HostButton>
                              <span style={{ color: "#6B5A8E", font: "400 10px 'Inter'" }}>Drag to reorder</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}
      </>}</section>
    </div>}
  </main></HostShell>;
}
