// Preserve all-time coverage while overlapping a bounded number of reads.
// Keep 500-row pages to respect the existing database response cap.
export async function loadHistoryPages<T>(page: (from: number, to: number) => Promise<T[]>, progress?: (loaded: number) => void): Promise<T[]> {
  const size = 500;
  const first = await page(0, size - 1);
  const result = [...first];
  progress?.(result.length);
  if (first.length < size) return result;
  for (let offset = size; ; offset += size * 4) {
    const pages = await Promise.all(Array.from({ length: 4 }, (_, index) => page(offset + index * size, offset + (index + 1) * size - 1)));
    for (const rows of pages) {
      result.push(...rows);
      progress?.(result.length);
      if (rows.length < size) return result;
    }
  }
}
