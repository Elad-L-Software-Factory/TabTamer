import { deflateSync } from 'node:zlib';
import { nativeImage, type NativeImage } from 'electron';
import { ALERT_ORANGE, BRAND_BLUE, badgeText, drawIcon, encodePng } from '@tabtamer/brand';

export const NUDGE_THRESHOLD = 30;

/** Tray icon showing the live tab count (orange at the nudge threshold). */
export function trayIcon(count: number | null): NativeImage {
  const text = count === null ? 'T' : badgeText(count);
  const bg = count !== null && count >= NUDGE_THRESHOLD ? ALERT_ORANGE : BRAND_BLUE;
  const image = nativeImage.createEmpty();
  for (const [size, scaleFactor] of [
    [16, 1],
    [24, 1.5],
    [32, 2],
  ] as const) {
    const png = encodePng(drawIcon(size, text, bg), size, size, (d) => deflateSync(d));
    image.addRepresentation({ scaleFactor, buffer: Buffer.from(png) });
  }
  return image;
}
