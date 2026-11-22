import { describe, expect, it } from 'vitest';
import {
  LineDecoder,
  NativeMessageDecoder,
  encodeLine,
  encodeNativeMessage,
  MAX_HOST_TO_BROWSER_BYTES,
} from './framing';

describe('native messaging framing', () => {
  it('prefixes JSON with a 4-byte little-endian length', () => {
    const bytes = encodeNativeMessage({ a: 1 });
    const json = '{"a":1}';
    expect(bytes.length).toBe(4 + json.length);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(json.length);
    expect(new TextDecoder().decode(bytes.slice(4))).toBe(json);
  });

  it('counts UTF-8 bytes, not characters', () => {
    const bytes = encodeNativeMessage({ t: 'שלום 🎉' });
    const len = new DataView(bytes.buffer).getUint32(0, true);
    expect(len).toBe(bytes.length - 4);
  });

  it('decodes messages split across chunks and several in one chunk', () => {
    const a = encodeNativeMessage({ n: 1 });
    const b = encodeNativeMessage({ n: 2 });
    const all = new Uint8Array([...a, ...b]);
    const d = new NativeMessageDecoder();
    expect(d.push(all.slice(0, 3))).toEqual([]);
    expect(d.push(all.slice(3, a.length + 2))).toEqual([{ n: 1 }]);
    expect(d.push(all.slice(a.length + 2))).toEqual([{ n: 2 }]);
  });

  it('refuses to encode messages over the browser limit', () => {
    const big = 'x'.repeat(MAX_HOST_TO_BROWSER_BYTES);
    expect(() => encodeNativeMessage({ big })).toThrow(/too large/);
  });

  it('skips a frame with invalid JSON and keeps decoding', () => {
    const bad = new TextEncoder().encode('{oops');
    const frame = new Uint8Array(4 + bad.length);
    new DataView(frame.buffer).setUint32(0, bad.length, true);
    frame.set(bad, 4);
    const good = encodeNativeMessage({ ok: true });
    const d = new NativeMessageDecoder();
    expect(d.push(new Uint8Array([...frame, ...good]))).toEqual([{ ok: true }]);
  });
});

describe('line framing (named pipe)', () => {
  it('round-trips objects split at any point', () => {
    const text = encodeLine({ a: 1 }) + encodeLine({ b: 'x\ny' });
    const d = new LineDecoder();
    const out = [...d.push(text.slice(0, 5)), ...d.push(text.slice(5))];
    expect(out).toEqual([{ a: 1 }, { b: 'x\ny' }]);
  });
});
