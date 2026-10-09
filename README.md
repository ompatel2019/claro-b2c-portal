# Claro portal

Student portal for Claro: NSW HSC Economics practice with instant AI marking.
Next.js 16 (App Router, `src/proxy.ts`), Supabase (auth, Postgres with RLS, storage), OpenAI.

## Setup

```bash
nvm use
npm install
cp .env.example .env.local   # then fill in every value
npm run dev
```

## Layout

- `src/app/(auth)`: sign in / sign up; `src/app/page.tsx` student home; `src/app/admin` admin home
- `src/app/api`: marking route handlers (attempt mark/transcribe, flashcard mark, session finish)
- `src/lib/marking`: band-first marking engine (pure grading helpers, prompts, schemas, server engine)
- `src/lib/ai`: OpenAI structured-output calls, per-model prices, cost logging to `ai_usage` and the budget guard
- `supabase/migrations`: every schema change, applied in order (`scripts/sql.sh <file>` runs one via the Management API)
  - Numbering: a new migration takes the next free number above the highest file on `origin/main` (pull first) and never reuses one. Two files share 0027 (`0027_evals_bucket.sql`, `0027_single_check_write_guards.sql`); both are applied on the project (there is no `supabase_migrations` tracking table, files are applied by hand), they are independent, and they stay as they are, applied in filename order.
- `scripts`: content seeding (NESA past papers, flashcards), marking eval, AI spend export

Scripts run with `npx tsx --conditions=react-server --env-file=.env.local scripts/<name>.mts`.

## Quality commands

```bash
npm run check       # formatting, linting, types, and unit tests
npm run test:e2e    # Playwright (set PORT to change the dev server port)
npm run build
```
