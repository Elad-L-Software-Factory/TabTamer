/**
 * TabTamer icon drawn in code: a blue rounded square with white pixel text.
 * Used for the extension icons (build time) and the live tray badge (run time).
 */

export const BRAND_BLUE: Rgba = [76, 110, 245, 255];
export const ALERT_ORANGE: Rgba = [240, 140, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];

export type Rgba = [number, number, number, number];

// 3x5 pixel glyphs, rows top to bottom, '#' = on.
const GLYPHS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  '+': ['...', '.#.', '###', '.#.', '...'],
};

/** Text shown on the tray badge for a tab count. */
export function badgeText(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return n > 999 ? '99+' : String(n);
}

/** Draws the icon as RGBA pixels (row-major, 4 bytes per pixel). */
export function drawIcon(size: number, text = 'T', background: Rgba = BRAND_BLUE): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.22));

  // Rounded square with simple anti-aliased corners.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coverage = roundedCoverage(x + 0.5, y + 0.5, size, radius);
      if (coverage <= 0) continue;
      const i = (y * size + x) * 4;
      px[i] = background[0];
      px[i + 1] = background[1];
      px[i + 2] = background[2];
      px[i + 3] = Math.round(background[3] * coverage);
    }
  }

  // Centered pixel text, as large as fits in ~80% of the icon.
  const chars = [...text].filter((c) => GLYPHS[c]);
  if (chars.length === 0) return px;
  const textW = chars.length * 4 - 1;
  const scale = Math.max(1, Math.floor(Math.min((size * 0.8) / textW, (size * 0.7) / 5)));
  const x0 = Math.floor((size - textW * scale) / 2);
  const y0 = Math.floor((size - 5 * scale) / 2);
  chars.forEach((c, ci) => {
    const glyph = GLYPHS[c]!;
    glyph.forEach((row, gy) => {
      [...row].forEach((cell, gx) => {
        if (cell !== '#') return;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = x0 + (ci * 4 + gx) * scale + dx;
            const y = y0 + gy * scale + dy;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const i = (y * size + x) * 4;
            px.set(WHITE, i);
          }
        }
      });
    });
  });
  return px;
}

function roundedCoverage(x: number, y: number, size: number, r: number): number {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  const d = Math.hypot(x - cx, y - cy);
  return Math.min(1, Math.max(0, r - d + 0.5));
}

// ---------- Minimal PNG encoder (deflate is injected, e.g. zlib.deflateSync) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  out.set(typeBytes, 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(
  rgba: Uint8Array,
  width: number,
  height: number,
  deflate: (data: Uint8Array) => Uint8Array,
): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflate(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}
