export class BodyError extends Error {
  constructor(public status: number) {
    super("Invalid JSON request");
  }
}
export async function readSmallJson(request: Request) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new BodyError(415);
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new BodyError(413);
      }
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new BodyError(400);
    }
  } finally {
    reader.releaseLock();
  }
}
