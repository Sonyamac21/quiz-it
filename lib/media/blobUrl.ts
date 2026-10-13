export function isVercelBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && /^[a-z0-9-]+\.(?:public|private)\.blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch { return false; }
}
