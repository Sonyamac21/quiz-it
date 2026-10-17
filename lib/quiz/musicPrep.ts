import { isVercelBlobUrl } from "../media/blobUrl.ts";
type MusicQuestion = { question_type?: string; question_text?: string; correct_answer?: string; option_a?: string | null; option_b?: string | null };
const normaliseTrack = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function findSavedTrack(lookup: string, assets: Array<{ title?: string | null; artist?: string | null; file_url?: string | null }>): string | null {
  const key = normaliseTrack(lookup);
  if (!key) return null;
  const matches = assets.filter(asset => asset.title && asset.artist && asset.file_url && isVercelBlobUrl(asset.file_url) &&
    [normaliseTrack(`${asset.title} ${asset.artist}`), normaliseTrack(`${asset.artist} ${asset.title}`)].includes(key));
  // Multiple trims of the same recording require a host's choice.
  const urls = [...new Set(matches.map(asset => asset.file_url!))];
  return urls.length === 1 ? urls[0] : null;
}

export async function saveMusicClip<T extends MusicQuestion>(expected: T, index: number, url: string,
  load: () => Promise<T[]>, compareAndSave: (before: T[], after: T[]) => Promise<boolean>): Promise<T[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await load();
    const current = before[index];
    if (!current || current.question_type !== "audio" || ["question_text", "correct_answer", "option_a"].some(key => current[key as keyof T] !== expected[key as keyof T])) {
      throw new Error("This question changed during music prep. Reopen it before saving the clip.");
    }
    const after = before.map((question, i) => i === index ? { ...question, option_b: url } : question);
    if (await compareAndSave(before, after)) return after;
  }
  throw new Error("The round is being edited elsewhere. Your uploaded clip is retained in Music & Media; try saving again.");
}
