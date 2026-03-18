---
name: prompt-loop
description: Expand one prompt across many items (list, folder, or git files) so the user runs one Cursor Agent chat per item. Use when batching refactors, page-by-page audits, or per-file tasks to avoid condensed context and missed files.
---

# Prompt loop (loop-prompt plugin)

## Goal

Run **one isolated Agent chat per item** (value or file). Do not merge many files into a single “do everything” request when reliability matters.

## Placeholders

In your template string or file:

| Placeholder | Meaning |
|-------------|---------|
| `{{item}}` | List value, or absolute file path (dir/git mode) |
| `{{index}}` | 1-based index |
| `{{path}}` | Same as absolute path in file modes |
| `{{relpath}}` | Path relative to `--dir` root or repo-relative for git |
| `{{basename}}` | File name only |

Literal `{{`: use `\{{` in the template.

## CLI (primary)

From the **workspace root** (your app repo), run the expander shipped with this plugin:

```bash
node /path/to/loop-prompt-plugin/scripts/loop-expand.mjs \
  --template 'Refactor exports in {{relpath}}' \
  --dir ./src --glob '**/*.ts' --force
```

Other sources:

- **List:** `--values 'a,b,c'` or `--values-file lines.txt` or JSON array file
- **Git tracked:** `--git-path src/` with optional `--glob '**/*.tsx'`

Outputs:

- `.loop/prompts/001-….md` — paste into a **new** Agent chat (or `@` the file)
- `.loop/manifest.json` — progress checklist (`done` flags if using MCP)

If there are more than **500** items, add `--confirm`.

## MCP (optional)

If the **loop-prompt** MCP server is enabled in Cursor:

- `loop_expand` — same as CLI (pass `projectRoot` + template + source fields)
- `loop_status` — counts done / remaining
- `loop_next_prompt` — next incomplete item’s full prompt text
- `loop_mark_done` — mark an index complete after that chat finishes

Use **one chat per item**: after finishing item *n*, open a **new** chat, call `loop_next_prompt` (or open the next `.md` file).

## Agent discipline

1. After expanding, work **only** from the prompt in `001-….md` (or the MCP-returned text) for that session.
2. Do not silently skip items; if blocked, say so and stop.
3. For the next item, **new chat** (or explicitly continue only if the user asked to batch).
