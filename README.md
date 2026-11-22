# TabTamer

**TabTamer (by Elad Lavi)** is a Windows tray app that tames your Chrome and Edge tabs with an AI agent.

> Turn 80 open tabs into 8 in under two minutes, without ever losing anything that matters.

## What it does

1. **Sweep:** finds junk tabs (meeting launchers, blank tabs, login redirects, error pages) and duplicates, then closes them after you approve.
2. **Triage:** shows every remaining tab as a card with a one-line summary and a recommended action. One click to:
   - **Forget** it,
   - **Save** it to a category (Google Sheet + a visual rolodex Library), or
   - **Keep** it open in a themed browser window (e.g. Job Search, Research).
3. **Learns** your preferences over time, so recommendations need fewer corrections.

Your data lives in your own Google Drive. The AI provider is your choice (Claude by default, local models later).

## Status

Early development. See the milestones below.

| Milestone | Scope | Status |
|-----------|-------|--------|
| M1 Foundations | Monorepo, CI, browser helper, native relay, tray app | In progress |
| M2 Sweep | Junk and duplicate rules, approval list | Planned |
| M3 Triage | AI summaries and recommendations, themes | Planned |
| M4 Drive | Google sign-in, Drive and Sheets storage | Planned |
| M5 Library | Rolodex view, search, reopen | Planned |
| M6 Learning | Learned rules and personalization | Planned |
| M7 Installer | Setup wizard, auto-update, store listings | Planned |

## Architecture

- **Browser helper:** Manifest V3 extension for Chrome and Edge (`apps/extension`)
- **Desktop app:** Electron + React + TypeScript tray app (`apps/desktop`)
- **Shared packages:** core rules, LLM gateway, Drive client (`packages/*`)
- The helper and app talk over Native Messaging (no open network ports).

## Security

- No secrets or personal data are ever committed. Every commit and push is scanned by [gitleaks](https://github.com/gitleaks/gitleaks).
- Local secrets go in `.env` (ignored by Git). See `.env.example`.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
