import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PLACEHOLDER = /^(your-|<|$)/;

/**
 * Development: the Claude key comes from ANTHROPIC_API_KEY or the repo's .env file
 * (which Git ignores). The installed app will keep it encrypted in Windows instead (M7).
 * The key is never logged or sent anywhere except to the Claude API.
 */
export function loadApiKey(appPath: string): string | undefined {
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim();
  if (fromEnv && !PLACEHOLDER.test(fromEnv)) return fromEnv;
  try {
    const text = readFileSync(path.resolve(appPath, '../../.env'), 'utf8');
    const line = text.split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    const value = line
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^["']|["']$/g, '');
    return value && !PLACEHOLDER.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when the user signed in with `ant auth login` (browser sign-in, no key to copy).
 * The Claude SDK finds that sign-in by itself; we only check it exists.
 */
export function hasClaudeSignIn(): boolean {
  if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) return true;
  const base =
    process.env.ANTHROPIC_CONFIG_DIR ??
    (process.env.APPDATA ? path.join(process.env.APPDATA, 'Anthropic') : '');
  const dir = base && path.join(base, 'credentials');
  try {
    return Boolean(dir && existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('.json')));
  } catch {
    return false;
  }
}
