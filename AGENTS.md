# AGENTS.md

## Purpose
Guidelines for Codex/OpenAI agents working in this repository. Keep edits small, verifiable, and aligned with the current project layout.

## Current Project Structure
- `index.html`: page shell, SEO/meta, and script/style entrypoints.
- `assets/js/app.mjs`: core viewer logic (parsing, rendering, state, interactions).
- `assets/css/styles.css`: full UI styling and theme variables.
- `tests/upload.test.mjs`: automated behavior tests with a DOM-like harness.
- `README.md`: product description and external context.

If you rename IDs/classes used by JavaScript, update tests in the same change.

## Commands
- Run tests: `node --test tests/upload.test.mjs`
- Local preview: `python3 -m http.server 8000`
- Open app: `http://localhost:8000/index.html`

No build step or bundler is used; this is a static browser app.

## Codex Workflow (Required)
1. Read relevant files first (`index.html`, `assets/js/app.mjs`, `assets/css/styles.css`, tests).
2. Make focused edits only for the requested task.
3. Add or update tests when behavior changes.
4. Run `node --test tests/upload.test.mjs` before finishing.
5. In final summary, report:
   - changed files;
   - what behavior changed;
   - test command and result.

## Coding Conventions
- Indentation: 2 spaces (HTML/CSS/JS).
- JavaScript: `camelCase` for functions/variables.
- CSS classes: concise `kebab-case`.
- Prefer small helper functions and early returns.
- Avoid large duplicated blocks; keep logic grouped by concern (parse, normalize, render, UI state).

## Testing Expectations
- Framework: built-in `node:test` + `assert/strict`.
- Test names should describe user-visible behavior.
- Add tests for:
  - JSONL parsing and classification changes;
  - rendering or visibility state changes;
  - interactions (clear, navigation, copy, theme, etc.) affected by the edit.

## Commit & PR Guidance
- Use clear imperative commit subjects, e.g.:
  - `fix nav focus state reset after clear`
  - `add test for malformed jsonl line handling`
- PR description should include:
  - what changed and why;
  - exact verification steps with command output;
  - screenshot/GIF for UI changes.
