import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';
import type { AiRecommendation, TabForAI, TriageContext, TriageProvider, Usage } from './types';

/** Cheapest current Claude model. Changeable in Settings; never switched automatically. */
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5';

export const TriageResultSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      summary: z.string(),
      action: z.enum(['forget', 'save', 'theme']),
      target: z.string(),
      confidence: z.enum(['low', 'medium', 'high']),
      reason: z.string(),
    }),
  ),
});

/** The slice of the SDK client this provider uses (lets tests pass a fake). */
export interface ParseClient {
  messages: Pick<Anthropic['messages'], 'parse'>;
}

export class AiUnavailableError extends Error {}

export class ClaudeProvider implements TriageProvider {
  readonly name = 'Claude';
  private readonly client: ParseClient;

  constructor(
    opts: { apiKey?: string; client?: ParseClient } = {},
    readonly model: string = DEFAULT_CLAUDE_MODEL,
  ) {
    // With no key, the SDK uses the `ant auth login` browser sign-in profile instead.
    this.client =
      opts.client ??
      new Anthropic(opts.apiKey ? { apiKey: opts.apiKey, maxRetries: 2 } : { maxRetries: 2 });
  }

  async classify(
    tabs: TabForAI[],
    ctx: TriageContext,
  ): Promise<{ items: AiRecommendation[]; usage: Usage }> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 8000,
      // Classification: low effort is plenty and keeps cost and wait time down.
      output_config: { effort: 'low', format: zodOutputFormat(TriageResultSchema) },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(tabs, ctx) }],
    });

    const usage: Usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new AiUnavailableError(`No usable answer (stop reason: ${response.stop_reason})`);
    }
    const known = new Set(tabs.map((t) => t.id));
    const items = response.parsed_output.items.filter((i) => known.has(i.id));
    return { items, usage };
  }
}
