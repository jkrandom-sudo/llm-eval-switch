# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron desktop app for evaluating LLMs across multiple dimensions (reasoning, safety, coding, etc.). Supports OpenAI-compatible and Anthropic APIs. Chinese-language project; UI strings and error messages are primarily in Chinese with full i18n support (en, zh-CN, zh-TW, ja, ko, fr, de, es). All source is CommonJS (`require`/`module.exports`), no bundler or transpiler.

## Commands

```bash
npm install          # Install dependencies
npm start            # Launch Electron app
npm run check        # Run smoke/integration tests (requires parent repo's eval_config.yaml + datasets/)
npm run dist:mac     # Build macOS distributable
npm run dist:win     # Build Windows distributable
```

There is no lint, unit test suite, or TypeScript compilation step. `npm run check` is the only test — it validates config loading, dimension discovery, evaluation scoring, model CRUD, and report generation against the parent repo's data.

## Architecture

**Electron main process** (`src/main.js`): IPC handlers bridge renderer to backend modules. Single `EvalEngine` instance per run, with abort/pause/resume/stop per model via `model:control` IPC.

**Preload** (`src/preload.js`): Exposes `window.llmEval` API via `contextBridge`. All renderer↔main communication goes through IPC invoke channels (`state:get`, `eval:run`, `eval:abort`, etc.) and one event channel (`eval:event`).

**Core evaluation pipeline** (main process):
- `configStore.js` — Loads `eval_config.yaml` from the project root, discovers dimensions from config + `datasets/` directory, persists user models to `models.json` in Electron's userData dir. Environment variable interpolation via `${VAR}` syntax.
- `engine.js` — `EvalEngine` (EventEmitter) orchestrates multi-model evaluation with configurable concurrency. Emits progress events (`run_start`, `case_start`, `case_done`, `dimension_done`, `all_done`). Supports per-model pause/resume/stop. Computes weighted overall scores across dimensions. Includes dedicated performance-only benchmark mode with built-in prompts.
- `runner.js` — Executes API calls to OpenAI (`/chat/completions`) and Anthropic (`/v1/messages`). Streams responses for performance metrics (TTFT, tokens/sec). Falls back to non-streaming on 400/422 errors. Token estimation uses CJK-aware heuristic.
- `evaluator.js` — Dimension-specific scoring functions dispatched by dimension name. Each dimension has its own evaluation logic (keyword overlap, constraint checking, JSON parsing, refusal detection for safety, static code analysis, etc.). Returns `{score, passed, details}`.
- `report.js` — Generates per-model JSON+HTML reports and multi-model leaderboard JSON+HTML. All output goes to the configured output directory.
- `paths.js` — Resolves project root: packaged app uses `process.resourcesPath`, dev uses `../../..` (parent repo root). Override with `LLM_EVAL_PROJECT_ROOT` env var.

**Renderer** (`src/renderer.js` + `src/index.html` + `src/styles.css`): Single-page app with four panels (Evaluate, Models, Datasets, Reports). Full i18n via `I18N` dictionary object. No build step — vanilla JS loaded directly by Electron.

## IPC Channels

| Channel | Direction | Purpose |
|---|---|---|
| `state:get` | invoke | Load models + dimensions on startup |
| `models:get` / `dimensions:get` | invoke | Fetch models or dimensions separately |
| `model:save` / `model:delete` | invoke | Upsert or delete user models |
| `dialog:output` | invoke | Show directory picker for output |
| `path:open` | invoke | Open file/folder in OS |
| `eval:run` | invoke | Start evaluation run (one at a time) |
| `eval:abort` | invoke | Abort current evaluation |
| `eval:model-control` | invoke | Pause/resume/stop a specific model |
| `reports:compare` | invoke | Generate leaderboard from existing reports |
| `eval:event` | on | Main→renderer event stream (progress, retries, completion) |

## Evaluator Dispatch

`evaluator.js` routes by dimension name to a specific scoring function:

| Dimension | Scoring function | Key logic |
|---|---|---|
| `tool_use` | `evaluateToolUse` | JSON parse + tool name + arg matching |
| `safety` | `evaluateSafety` | Refusal pattern + risky response detection |
| `coding` | `evaluateCoding` | Static code structure analysis |
| `code_review` | `evaluateCodeReview` | Keyword matching against expected issues |
| `instruction_following`, `structured_output`, `robustness` | `evaluateConstraints` | Constraint checklist (contains, format, word count, etc.) |
| `data_analysis` | `evaluateData` | Numeric or multiple_choice or keyword fallback |
| `long_context`, `retrieval_qa` | `evaluateLongContext` | Needle-in-haystack or keyword/numeric |
| `reasoning` | `evaluateReasoning` | 50% final answer + 50% required steps |
| `creative_writing` | `evaluateCreative` | Required elements or length heuristic |
| `counterfactual_reasoning` | `evaluateKeywords` | threshold 0.7 |
| `domain_expertise`, `agent_planning` | `evaluateKeywords` | threshold 0.8 |
| default (all others) | `evaluateKnowledge` | exact_match, keyword_overlap, contains_all, or numeric |

## Key Data Flow

1. App loads → `state:get` IPC → `configStore` reads `eval_config.yaml` + discovers `datasets/*/test_cases.json`
2. User configures models (saved to userData `models.json`, not eval_config.yaml)
3. User selects models + dimensions + question count preset → `eval:run` IPC
4. `EvalEngine.runModels()` processes models concurrently (bounded by `model_concurrency` config)
5. For each model×dimension×test_case: `runner` calls API → `evaluator` scores response → event emitted to renderer
6. After all models complete: `report.js` writes per-model reports + leaderboard

## Config & Data Dependencies

The app depends on files from the **parent repository** (three directories up):
- `eval_config.yaml` — Evaluation parameters, dimension definitions (with weights and scoring methods)
- `datasets/<dimension>/test_cases.json` — Test case files per evaluation dimension

These are bundled as `extraResources` in electron-builder config for packaged builds.

## Environment Variables

- `LLM_EVAL_PROJECT_ROOT` — Override project root path
- `LLM_EVAL_USER_DATA` — Override user data directory (used by smoke tests)
- `${VAR}` in `api_key`/`base_url` fields — Resolved at runtime from process.env
