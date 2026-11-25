/** Media response bytes are capped before they are copied or decoded. */
export async function mediaBytes(url: string, cap: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isSafeInteger(cap) || cap < 0) throw new Error("the media byte cap must be a non-negative integer");
  const res = await fetch(url, { signal });
  const reader = res.body?.getReader();
  let complete = false;
  try {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length")) > cap) throw new Error(`the media file exceeds its ${cap} byte cap`);
    if (!reader) throw new Error("the media response has no readable body");
    let bytes = new Uint8Array(0), size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { complete = true; return size === bytes.length ? bytes : bytes.slice(0, size); }
      const next = size + value.byteLength;
      if (next > cap) throw new Error(`the media file exceeds its ${cap} byte cap`);
      if (next > bytes.length) {
        const grown = new Uint8Array(Math.min(cap, Math.max(next, 65_536, bytes.length * 2)));
        grown.set(bytes.subarray(0, size)); bytes = grown;
      }
      bytes.set(value, size); size = next;
    }
  } finally {
    if (reader) {
      try { if (!complete) await reader.cancel(); } catch { /* keep the load error */ }
      reader.releaseLock();
    }
  }
}

export async function mediaText(url: string, cap: number, signal?: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await mediaBytes(url, cap, signal));
}
