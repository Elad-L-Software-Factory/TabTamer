import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { BRAND_BLUE, badgeText, drawIcon, encodePng } from './index';

describe('badgeText', () => {
  it('shows the count, capped at 99+', () => {
    expect(badgeText(0)).toBe('0');
    expect(badgeText(47)).toBe('47');
    expect(badgeText(999)).toBe('999');
    expect(badgeText(1000)).toBe('99+');
    expect(badgeText(-3)).toBe('0');
  });
});

describe('drawIcon', () => {
  it('fills the center with brand color or white text and leaves corners transparent', () => {
    const size = 32;
    const px = drawIcon(size, '47');
    expect(px.length).toBe(size * size * 4);
    expect(px[3]).toBe(0); // top-left corner pixel alpha
    const mid = (16 * size + 1) * 4; // left edge, middle row: background
    expect([...px.slice(mid, mid + 4)]).toEqual(BRAND_BLUE);
    const hasWhite = px.some((_, i) => i % 4 === 0 && px[i] === 255 && px[i + 1] === 255);
    expect(hasWhite).toBe(true);
  });
});

describe('encodePng', () => {
  it('produces a PNG with the right signature and size header', () => {
    const png = encodePng(drawIcon(16), 16, 16, (d) => new Uint8Array(deflateSync(d)));
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer);
    expect(view.getUint32(16)).toBe(16);
    expect(view.getUint32(20)).toBe(16);
  });
});
