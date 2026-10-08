# Project Template

A deliberately small, production-oriented foundation for Next.js applications.
The template includes Supabase authentication, shadcn/ui, Tailwind
CSS, unit and browser testing, formatting, linting, type checking, and CI.

## Requirements

- Node.js 22 (see `.nvmrc`)
- npm 10.9.8
- A Supabase project

## Setup

```bash
nvm use
npm install
cp .env.example .env.local
```

Fill in every value in `.env.local`, then start the application:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Environment variables are validated with Zod at startup. Public variables live
in `src/env/client.ts`; server-only variables live in `src/env/server.ts`.

## Why development uses Webpack

Next.js 16 defaults to Turbopack. This template temporarily uses
`next dev --webpack` because current Turbopack builds can emit severe allocator
noise and consume excessive memory on Apple Silicon with macOS 26. Re-test
Turbopack when upgrading Next.js and remove the flag once the upstream issue is
resolved.


## Quality commands

```bash
npm run check       # formatting, linting, types, and unit tests
npm run test:watch  # unit tests in watch mode
npm run test:e2e    # Playwright browser tests
npm run build       # production build
```

GitHub Actions runs `check`, `build`, and the Playwright suite for pull requests
and pushes to `main`.

## Structure

- `src/app` — App Router routes and layouts
- `src/components` — reusable UI components
- `src/env` — validated environment boundaries
- `src/utils/supabase` — browser/server Supabase clients and session refresh
- `e2e` — Playwright tests

Add architecture only when a real product requirement justifies it. Prefer
small, explicit modules.
