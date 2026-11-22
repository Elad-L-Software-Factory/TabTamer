# CLAUDE.md: rules for working on TabTamer

TabTamer (by Elad Lavi) is a Windows tray app + Chrome/Edge extension that triages browser tabs with an LLM agent.

## Absolute rules
1. **Never commit secrets or personal data.** No API keys, OAuth client IDs/secrets, tokens, passwords, email addresses, account names or real user data. Secrets live only in `.env` (gitignored) or the OS credential store. Test data uses `example.com`.
2. Run `gitleaks git --staged --config .gitleaks.toml` before every commit (the pre-commit hook does this; never bypass it with `--no-verify`).
3. Commits use the GitHub noreply email only.
4. **No em dashes** in any user-facing text (UI strings, README, docs). Use commas, colons or parentheses.
5. Design documents live in the author's private Google Drive, not in this repo. `docs/` holds only short developer notes.

## Stack
- TypeScript (strict) everywhere, pnpm workspaces monorepo
- `apps/desktop`: Electron + React + Vite + Tailwind (main process = engine, renderer = screens)
- `apps/extension`: Manifest V3 extension for Chrome and Edge, talks to the app via Native Messaging
- `packages/core`: pure logic (types, URL normalizer, dedup, junk rules, learned rules). No I/O.
- `packages/llm`: provider interface + ClaudeProvider (cheapest model by default, configurable)
- `packages/drive`: Google Drive / Sheets client + sync queue
- Tests: Vitest (unit), Playwright (e2e)

## Working style
- Test-first for `packages/core` logic.
- Small feature branches + pull requests; CI must pass.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- UI must be "grandma-proof": plain words, one obvious next step per screen, minimal clicks.
