# JSONL Viewer for Claude Code

[![Open JSONL Viewer](https://img.shields.io/badge/Open-jsonl.qent.io-0f766e?style=for-the-badge)](https://jsonl.qent.io)

A web tool for viewing `Claude Code` session history in JSONL format with clean cards for messages, tool calls, results, and timeline navigation.

## What Claude Code Session JSONL Looks Like

`JSONL` (JSON Lines) is a format where each line is a standalone JSON event object.

In Claude Code session history, you will usually see:
- `type`: record type (`system`, `user`, `assistant`, `result`).
- `timestamp`: event time.
- `message.content`: an array of blocks, for example:
  - `text` for plain message content;
  - `tool_use` for a tool invocation request;
  - `tool_result` for the corresponding tool output.
- linkage `tool_use.id` ↔ `tool_result.tool_use_id` to match request and response.

Example:

```json
{"type":"assistant","timestamp":"2026-04-24T12:00:00Z","message":{"content":[{"type":"tool_use","id":"tool-1","name":"Bash","input":{"command":"echo 42"}}]}}
{"type":"user","timestamp":"2026-04-24T12:00:01Z","message":{"content":[{"type":"tool_result","tool_use_id":"tool-1","content":"42"}]}}
```

## What This Site Lets You Do

- Upload one or multiple `.jsonl` files via drag-and-drop or file picker.
- Parse logs and render structured message cards.
- Stream and index large session files instead of loading the full JSONL into memory.
- Recycle off-screen message and navigation rows for long histories.
- Highlight entry types (`system`, `user`, `agent`, `tool`, `result`) and errors.
- Show paired `tool request` / `tool result` panels with quick copy actions for JSON/text.
- Navigate long sessions quickly using the side navigation list.
- Switch between light and dark themes.

## Open Online

Use the live viewer: **[jsonl.qent.io](https://jsonl.qent.io)**.
