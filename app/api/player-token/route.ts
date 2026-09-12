import { createHash, randomUUID } from "node:crypto";

export async function POST() {
  const token = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  return Response.json(
    { token, tokenHash },
    { headers: { "Cache-Control": "no-store" } },
  );
}
