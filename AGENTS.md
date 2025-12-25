# Repository Guidelines

This repository currently contains product and architecture specifications for the AI-CustDev-CLI. Implementation work should align with `PROJECT_SPECIFICATIONS.md` and keep the contract between config, personas, interviews, and analytics strict.

## Project Structure & Module Organization
- Current top-level files: `README.md`, `PROJECT_SPECIFICATIONS.md`, `LICENSE`.
- Planned layout (when code is added): `config/`, `input/`, `output/` (artifacts, gitignored), and `src/`.
- Expected modules: `src/core/` (LLM client, config loader, logger), `src/types/` (interfaces), `src/stages/` (numbered stages like `1-generate.ts`), and `src/index.ts` for the CLI entry point.

## Build, Test, and Development Commands
- No build or test scripts are checked in yet; add them to `package.json` once the TypeScript project is initialized.
- Target runtime: Node.js 18+ with TypeScript 5+ and a TS runner like `tsx` or `ts-node`.
- Planned CLI usage (per spec): `npm start -- --project currency_mvp` to run a project config in `config/projects/`.

## Coding Style & Naming Conventions
- Use TypeScript `strict` mode and validate JSON boundaries with `zod`.
- File naming: `kebab-case` for files; numbered stage files like `1-generate.ts`.
- Naming: `PascalCase` for classes, `camelCase` for variables and functions.
- Indentation: 2 spaces; keep files ASCII and end with a newline.

## Testing Guidelines
- No testing framework is configured yet; introduce one before adding tests.
- Prefer `tests/` or `src/**/__tests__/` with `*.test.ts` naming.
- Add an `npm test` script once a runner (e.g., Vitest or Jest) is chosen.

## Commit & Pull Request Guidelines
- Git history only contains “Initial commit,” so no established convention exists yet.
- Use concise, imperative commit summaries; add a scope when helpful (e.g., `core: add LlmClient`).
- PRs should include: a clear problem statement, how to run or test changes, and any config or prompt updates.

## Security & Configuration
- Expect `.env` with `OPENROUTER_API_KEY`; never commit secrets.
- Keep generated artifacts under `output/` and avoid committing large logs.

## Architecture & Workflow Notes
- The workflow is three stages: generate personas, simulate interviews, analyze logs.
- Keep interfaces centralized in `src/types/` and maintain strict typing across config, persona, and analytics flows.
