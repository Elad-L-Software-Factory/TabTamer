import type { Usage } from './types';

/** US dollars per million tokens. */
export interface Pricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Published Claude API prices (prompts up to 100K tokens) for the models TabTamer offers.
 * Cache reads cost 0.1x input and 5-minute cache writes 1.25x input.
 */
export const PRICING: Record<string, Pricing> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};

export function costUsd(model: string, u: Usage): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (
    (u.inputTokens * p.input +
      u.outputTokens * p.output +
      u.cacheReadTokens * p.cacheRead +
      u.cacheWriteTokens * p.cacheWrite) /
    1_000_000
  );
}

/** Tracks spend per calendar month against a cap. */
export class CostMeter {
  constructor(
    private state: { month: string; usd: number },
    readonly capUsd: number,
  ) {}

  static monthKey(d = new Date()): string {
    return d.toISOString().slice(0, 7);
  }

  private roll(now: Date) {
    const m = CostMeter.monthKey(now);
    if (this.state.month !== m) this.state = { month: m, usd: 0 };
  }

  spent(now = new Date()): number {
    this.roll(now);
    return this.state.usd;
  }

  canSpend(now = new Date()): boolean {
    return this.spent(now) < this.capUsd;
  }

  add(model: string, usage: Usage, now = new Date()): number {
    this.roll(now);
    const usd = costUsd(model, usage);
    this.state = { ...this.state, usd: this.state.usd + usd };
    return usd;
  }

  snapshot(): { month: string; usd: number } {
    return { ...this.state };
  }
}
