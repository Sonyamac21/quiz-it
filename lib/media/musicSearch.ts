const normalise = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function rankMusicResults<T extends { title: string; artist: string; preview_url: string }>(query: string, candidates: T[]): T[] {
  const parts = query.split(/\s+[-–—]\s+/);
  const expectedArtist = parts.length === 2 ? normalise(parts[1]) : "";
  const expectedTitle = normalise(parts[0]);
  const tokens = new Set(normalise(query).split(" "));
  const score = (track: T) => {
    const artist = normalise(track.artist);
    const title = normalise(track.title);
    const coverage = [...tokens].filter(token => `${title} ${artist}`.split(" ").includes(token)).length;
    const versionPenalty = /\b(cover|karaoke|tribute|instrumental|sped up|slowed|remix|live)\b/i.test(track.title) && !/\b(cover|karaoke|tribute|instrumental|sped up|slowed|remix|live)\b/i.test(query) ? 30 : 0;
    return coverage * 5 + (expectedArtist && artist === expectedArtist ? 100 : 0) + (title === expectedTitle ? 20 : 0) - versionPenalty;
  };
  const seen = new Set<string>();
  return [...candidates].sort((a, b) => score(b) - score(a)).filter(track => {
    const key = `${normalise(track.title)}|${normalise(track.artist)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
