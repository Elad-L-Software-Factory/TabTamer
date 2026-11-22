// Live check of the AI brain with 3 made-up tabs (costs a fraction of a cent).
// Reads the key the same way the app does (ANTHROPIC_API_KEY or the repo's .env); never prints it.
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../../..');
const { outputFiles } = await build({
  stdin: {
    contents:
      "export { loadApiKey, hasClaudeSignIn } from './apiKey'; export { ClaudeProvider, costUsd } from '@tabtamer/llm';",
    resolveDir: path.join(root, 'apps/desktop/src/main'),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { loadApiKey, hasClaudeSignIn, ClaudeProvider, costUsd } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

const apiKey = loadApiKey(path.join(root, 'apps/desktop'));
if (!apiKey && !hasClaudeSignIn()) {
  console.log(
    'No Claude access found. Run "ant auth login" (browser sign-in) or put a key in .env, then try again.',
  );
  process.exit(1);
}
console.log(`Using ${apiKey ? 'the key from .env / environment' : 'your ant browser sign-in'}.`);

const tabs = [
  {
    id: 'a',
    title: 'Senior Product Manager, AI Platform | Example Corp Careers',
    url: 'https://careers.example.com/jobs/12345',
    text: 'We are hiring a Senior PM to lead our AI platform. Remote. Apply by Dec 15. Requirements: 7+ years product management...',
  },
  {
    id: 'b',
    title: 'Weather - Tel Aviv - hourly forecast',
    url: 'https://weather.example.com/tel-aviv',
    text: 'Today 24°C sunny. Tomorrow 22°C. Hourly forecast...',
  },
  {
    id: 'c',
    title: 'A practical guide to async programming in Python',
    url: 'https://example.org/guides/python-async',
    text: 'In this guide we explain asyncio, event loops, tasks and common patterns with examples...',
  },
];

const provider = new ClaudeProvider(apiKey ? { apiKey } : {});
const started = Date.now();
try {
  const { items, usage } = await provider.classify(tabs, {
    categories: [
      'Jobs',
      'Learning',
      'AI & Tech',
      'Work',
      'Shopping',
      'News & Reading',
      'Finance',
      'Personal',
    ],
    themes: ['Job Search', 'Research', 'Daily Tasks'],
  });
  for (const i of items) {
    console.log(`- [${i.id}] ${i.action}${i.target ? ` -> ${i.target}` : ''} (${i.confidence})`);
    console.log(`    ${i.summary}`);
    console.log(`    why: ${i.reason}`);
  }
  const usd = costUsd(provider.model, usage);
  console.log(
    `\nModel ${provider.model}, ${((Date.now() - started) / 1000).toFixed(1)}s, ` +
      `${usage.inputTokens} in / ${usage.outputTokens} out tokens, cost $${usd.toFixed(5)}`,
  );
  console.log(items.length === tabs.length ? 'AI CHECK PASSED' : 'AI CHECK: some tabs missing');
} catch (err) {
  // Typed SDK errors carry a status; never print request headers (they contain the key).
  console.log(`AI CHECK FAILED: ${err?.status ?? ''} ${err?.name ?? ''} ${err?.message ?? err}`);
  process.exit(1);
}
