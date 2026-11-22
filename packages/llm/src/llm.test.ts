import { describe, expect, it } from 'vitest';
import {
  AiUnavailableError,
  ClaudeProvider,
  CostMeter,
  DEFAULT_CLAUDE_MODEL,
  batches,
  buildUserPrompt,
  costUsd,
  type ParseClient,
} from './index';

const ctx = { categories: ['Jobs', 'Learning'], themes: ['Job Search'] };
const tabs = [
  {
    id: 't1',
    title: 'Senior PM | Acme',
    url: 'https://example.com/jobs/1',
    text: 'Apply now '.repeat(500),
  },
  { id: 't2', title: 'Weather', url: 'https://example.com/weather' },
];

function fakeClient(parsed: unknown, stop = 'end_turn') {
  const calls: unknown[] = [];
  const client = {
    messages: {
      parse: async (params: unknown) => {
        calls.push(params);
        return {
          stop_reason: stop,
          parsed_output: parsed,
          usage: {
            input_tokens: 1000,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        };
      },
    },
  } as unknown as ParseClient;
  return { client, calls };
}

describe('buildUserPrompt', () => {
  it('lists categories, themes and every tab with clipped page text', () => {
    const p = buildUserPrompt(tabs, ctx);
    expect(p).toContain('Categories: Jobs, Learning');
    expect(p).toContain('Themes: Job Search');
    expect(p).toContain('"id":"t1"');
    expect(p).toContain('"id":"t2"');
    const t1 = JSON.parse(p.split('\n').find((l) => l.includes('"t1"'))!);
    expect(t1.text.length).toBeLessThanOrEqual(2001);
  });

  it('includes past choices when available', () => {
    const p = buildUserPrompt(tabs, {
      ...ctx,
      examples: [
        { title: 'Job at X', url: 'https://example.com/x', action: 'theme', target: 'Job Search' },
      ],
    });
    expect(p).toContain('-> theme: Job Search');
  });
});

describe('batches', () => {
  it('splits into groups of 20', () => {
    expect(batches(Array.from({ length: 45 }, (_, i) => i)).map((b) => b.length)).toEqual([
      20, 20, 5,
    ]);
  });
});

describe('ClaudeProvider', () => {
  it('uses the cheapest model with structured output and returns known ids only', async () => {
    const { client, calls } = fakeClient({
      items: [
        {
          id: 't1',
          summary: 'PM job',
          action: 'theme',
          target: 'Job Search',
          confidence: 'high',
          reason: 'Active search',
        },
        { id: 'ghost', summary: 'x', action: 'forget', target: '', confidence: 'low', reason: 'x' },
      ],
    });
    const p = new ClaudeProvider({ client });
    const { items, usage } = await p.classify(tabs, ctx);
    expect(p.model).toBe(DEFAULT_CLAUDE_MODEL);
    expect(items.map((i) => i.id)).toEqual(['t1']);
    expect(usage.inputTokens).toBe(1000);
    const params = calls[0] as {
      model: string;
      output_config: { effort: string; format: unknown };
    };
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.output_config.effort).toBe('low');
    expect(params.output_config.format).toBeTruthy();
  });

  it('throws AiUnavailableError on a refusal or unparsable answer', async () => {
    const { client } = fakeClient(null, 'refusal');
    await expect(new ClaudeProvider({ client }).classify(tabs, ctx)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});

describe('cost', () => {
  it('prices Haiku usage', () => {
    // 1M input at $0.10 + 1M output at $0.50
    expect(
      costUsd('claude-haiku-5-5', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeCloseTo(0.6);
  });

  it('tracks monthly spend against the cap and resets each month', () => {
    const m = new CostMeter({ month: '2026-11', usd: 1.99 }, 2);
    const nov = new Date('2026-11-22T10:00:00Z');
    expect(m.canSpend(nov)).toBe(true);
    m.add(
      'claude-haiku-5-5',
      { inputTokens: 200_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      nov,
    );
    expect(m.canSpend(nov)).toBe(false);
    expect(m.canSpend(new Date('2026-12-01T00:00:00Z'))).toBe(true);
  });
});
