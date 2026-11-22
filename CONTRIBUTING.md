# Contributing to TabTamer

## One-time setup

1. Install Node.js 22+, pnpm, Git and [gitleaks](https://github.com/gitleaks/gitleaks).
2. Clone the repo, then turn on the secret-scanning commit hook:

   ```
   git config core.hooksPath .githooks
   ```

3. Copy `.env.example` to `.env` and fill in your own values. Never commit `.env`.

## Workflow

- `main` is always releasable. Work on short branches (`feat/...`, `fix/...`, `docs/...`).
- Open a pull request. CI (secret scan, lint, tests) must pass before merging.
- Use conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.

## Golden rule

Never commit passwords, API keys, tokens, OAuth client IDs or secrets, email addresses, account names or any personal data. Test data uses `example.com`.
