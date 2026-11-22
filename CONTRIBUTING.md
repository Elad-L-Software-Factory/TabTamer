# Contributing to TabTamer

## One-time setup

1. Install Node.js 22+, pnpm, Git and [gitleaks](https://github.com/gitleaks/gitleaks).
2. Clone the repo, then turn on the secret-scanning commit hook:

   ```
   git config core.hooksPath .githooks
   ```

3. Copy `.env.example` to `.env` and fill in your own values. Never commit `.env`.

## Run it locally (Windows)

```
pnpm install
pnpm build
pnpm register-host      # registers the native messaging relay for Chrome and Edge (current user)
pnpm dev                # starts the tray app (add --show to open the window)
```

Then load the browser helper once per browser:

1. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and pick `apps/extension/dist`.
3. The TabTamer tray icon now shows your live tab count.

Useful checks:

- `pnpm test`: unit tests plus a relay and named-pipe round trip (Windows)
- `pnpm smoke`: real-browser test with a throwaway Edge profile (close the tray app first)
- `pnpm register-host -Unregister`: remove the native host registration

## Workflow

- `main` is always releasable. Work on short branches (`feat/...`, `fix/...`, `docs/...`).
- Open a pull request. CI (secret scan, lint, tests) must pass before merging.
- Use conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, `test:`.

## Golden rule

Never commit passwords, API keys, tokens, OAuth client IDs or secrets, email addresses, account names or any personal data. Test data uses `example.com`.
