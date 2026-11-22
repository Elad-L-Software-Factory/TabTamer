/** What the AI sees about one tab. `id` is opaque (the app maps it back to the tab). */
export interface TabForAI {
  id: string;
  title: string;
  url: string;
  /** First ~2,000 characters of visible page text, when the browser could read it. */
  text?: string;
}

export interface TriageContext {
  categories: string[];
  themes: string[];
  /** Recent decisions the user made, so the AI can imitate them (filled in by M6 learning). */
  examples?: { title: string; url: string; action: string; target?: string }[];
}

export type AiAction = 'forget' | 'save' | 'theme';
export type Confidence = 'low' | 'medium' | 'high';

export interface AiRecommendation {
  id: string;
  summary: string;
  action: AiAction;
  /** Category name (save) or theme name (theme); empty for forget. */
  target: string;
  confidence: Confidence;
  reason: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Any AI brain TabTamer can use. Claude today; a local model can implement this later. */
export interface TriageProvider {
  readonly name: string;
  readonly model: string;
  classify(
    tabs: TabForAI[],
    context: TriageContext,
  ): Promise<{ items: AiRecommendation[]; usage: Usage }>;
}
