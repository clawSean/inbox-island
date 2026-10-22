function fail(code) {
  throw new Error(code);
}

async function cancelReader(reader, reason) {
  try {
    await reader.cancel(reason);
  } catch {
    // The original bounded-read failure remains authoritative.
  }
}

function bytesFrom(value) {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return null;
}

async function readStream(body, limit, signal) {
  let reader;
  try {
    reader = body.getReader();
  } catch {
    fail(signal?.aborted ? "GMAIL_ABORTED" : "GMAIL_RESPONSE_READ_FAILED");
  }
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await cancelReader(reader, "aborted");
        fail("GMAIL_ABORTED");
      }
      let item;
      try {
        item = await reader.read();
      } catch (error) {
        await cancelReader(reader, "read-failed");
        if (signal?.aborted || error?.name === "AbortError") fail("GMAIL_ABORTED");
        fail("GMAIL_RESPONSE_READ_FAILED");
      }
      if (item?.done) break;
      const chunk = bytesFrom(item?.value);
      if (!chunk) {
        await cancelReader(reader, "invalid-chunk");
        fail("GMAIL_RESPONSE_READ_FAILED");
      }
      if (total + chunk.byteLength > limit) {
        await cancelReader(reader, "response-too-large");
        fail("GMAIL_RESPONSE_TOO_LARGE");
      }
      total += chunk.byteLength;
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released or cancelled */ }
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

async function readFallback(response, limit, signal, declared) {
  if (declared === null || typeof response.text !== "function") {
    fail("GMAIL_RESPONSE_READ_FAILED");
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") fail("GMAIL_ABORTED");
    fail("GMAIL_RESPONSE_READ_FAILED");
  }
  if (new TextEncoder().encode(text).byteLength > limit) fail("GMAIL_RESPONSE_TOO_LARGE");
  return text;
}

export async function parseBoundedJson(response, { limit, signal }) {
  const header = response.headers?.get?.("content-length");
  let declared = null;
  if (header !== null && header !== undefined) {
    declared = Number(header);
    if (!Number.isSafeInteger(declared) || declared < 0) fail("GMAIL_RESPONSE_READ_FAILED");
    if (declared > limit) fail("GMAIL_RESPONSE_TOO_LARGE");
  }
  const hasStream = response.body && typeof response.body.getReader === "function";
  const text = hasStream
    ? await readStream(response.body, limit, signal)
    : await readFallback(response, limit, signal, declared);
  if (signal?.aborted) fail("GMAIL_ABORTED");
  try {
    return JSON.parse(text);
  } catch {
    fail("GMAIL_RESPONSE_INVALID_JSON");
  }
}
