/**
 * Chrome/Edge Native Messaging frames: 4-byte little-endian length + UTF-8 JSON.
 * Messages from the host (us) to the browser may not exceed 1 MB.
 */
export const MAX_HOST_TO_BROWSER_BYTES = 1024 * 1024;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeNativeMessage(message: unknown): Uint8Array {
  const body = encoder.encode(JSON.stringify(message));
  if (body.length > MAX_HOST_TO_BROWSER_BYTES) {
    throw new Error(`Native message too large: ${body.length} bytes`);
  }
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length, true);
  frame.set(body, 4);
  return frame;
}

/** Collects stdin chunks and yields complete decoded messages. */
export class NativeMessageDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): unknown[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const out: unknown[] = [];
    while (this.buffer.length >= 4) {
      const len = new DataView(this.buffer.buffer, this.buffer.byteOffset).getUint32(0, true);
      if (this.buffer.length < 4 + len) break;
      const body = this.buffer.slice(4, 4 + len);
      this.buffer = this.buffer.slice(4 + len);
      try {
        out.push(JSON.parse(decoder.decode(body)));
      } catch {
        // Ignore a corrupt frame; the next frame is still aligned.
      }
    }
    return out;
  }
}

/** Newline-delimited JSON, used on the private named pipe between relay and app. */
export function encodeLine(message: unknown): string {
  return JSON.stringify(message) + '\n';
}

export class LineDecoder {
  private pending = '';

  push(text: string): unknown[] {
    this.pending += text;
    const lines = this.pending.split('\n');
    this.pending = lines.pop() ?? '';
    const out: unknown[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        // Ignore a corrupt line.
      }
    }
    return out;
  }
}
