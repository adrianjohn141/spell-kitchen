# Contributing

1. Use Node.js 24 and run `npm ci`.
2. Copy `.env.example` to `.env.local` only if you want model generation. The game works without it.
3. Run `npm run dev` and open http://localhost:3000.

Before opening a pull request, run:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Keep the simulation deterministic and add tests for new mechanics. Add an entry at the top of `docs/CHANGELOG.md` in the form `## YYYY-MM-DD - Title - [Model or Author]`. New art must be CC0 or similarly permissive and listed in `docs/ASSETS.md`.
