# Repository Guidelines

## Project Structure & Module Organization
This repository is intentionally small and flat:
- `upload.html` contains the full app (HTML markup, CSS styles, and client-side JavaScript).
- `tests/upload.test.mjs` contains automated tests for rendering/state behavior.

When changing app logic, keep related functions grouped (parsing, rendering, UI state). If you add or rename DOM IDs/classes used in script logic, update tests in the same change.

## Build, Test, and Development Commands
- `node --test tests/upload.test.mjs` runs the automated test suite.
- `python3 -m http.server 8000` serves the project locally for browser testing.
- Open `http://localhost:8000/upload.html` to validate drag-and-drop rendering manually.

There is no bundler/build step; this project runs directly in the browser.

## Coding Style & Naming Conventions
- Use 2-space indentation across HTML, CSS, and JavaScript.
- JavaScript naming: `camelCase` for variables/functions (`formatTimestamp`, `renderEntries`).
- CSS naming: short `kebab-case` utility/component classes (`.dropzone-title`, `.file-block`).
- Prefer small, focused functions and early returns over deeply nested blocks.
- Keep `upload.html` readable: avoid large duplicated blocks and keep helper functions near related usage.

## Testing Guidelines
- Tests use Node’s built-in `node:test` with `assert/strict`.
- Name tests as behavior statements, e.g. `"clear button appears after rendering and hides again after clear"`.
- Add tests for any change to parsing, entry classification, or UI state transitions.
- Run `node --test tests/upload.test.mjs` before every commit.

## Commit & Pull Request Guidelines
Current history uses very short lowercase commits (`init`, `good`). For new changes, prefer clear imperative subjects:
- `fix result and tool highlight colors`
- `add test for empty JSONL lines`

PRs should include:
- What changed and why.
- Exact verification steps and command output.
- Screenshot/GIF for visual UI updates.
- Linked issue/task (if available).
