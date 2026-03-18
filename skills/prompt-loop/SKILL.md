---
name: prompt-loop
description: Expand a template over a list, directory, or git files; then run every item automatically. In Cursor (loop-prompt MCP): loop_next_prompt → execute → loop_mark_done in one chat. Alternative: loop-run-claude.sh for Claude Code CLI.
---

# Prompt loop (loop-prompt plugin)

## Goal

**One item per step** for reliability; **no manual “run the loop”** after expand when using **`/prompt-loop`**.

| Where | How to run all items after expand |
|-------|-----------------------------------|
| **Cursor IDE** (default) | **MCP:** `loop_next_prompt` → do the prompt → `loop_mark_done` → repeat until **LOOP COMPLETE**. Same Agent chat. |
| **Claude Code terminal** | `bash <plugin>/scripts/loop-run-claude.sh <projectRoot>/.loop/prompts` |
| **Manual** | New chat per `.md` under `.loop/prompts/` |

## Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `{{item}}` | List value or absolute path (file modes) |
| `{{index}}` | 1-based index |
| `{{path}}` | Absolute path |
| `{{relpath}}` | Relative path |
| `{{basename}}` | File name |

Literal `{{`: `\{{`.

## Expand (CLI or MCP)

```bash
node <plugin>/scripts/loop-expand.mjs \
  --template '...' \
  --values-file ./list.md --force
```

Also: `--dir`, `--git-path`, MCP **`loop_expand`**. Over **500** items → `--confirm`.

## Cursor: full auto-run (MCP)

Requires **loop-prompt** MCP enabled in Cursor.

1. **`loop_expand`** (or CLI expand).
2. Loop: **`loop_next_prompt(projectRoot)`** → execute only that prompt → **`loop_mark_done(projectRoot, index)`** until the tool reports complete.

Banner lines **`LOOP — ITEM k OF n`** and **`ITEM MARKED DONE`** show progress.

## Claude Code CLI stack

```bash
bash <plugin>/scripts/loop-run-claude.sh .loop/prompts --allowedTools Read,Write,Bash
```

See [headless `-p`](https://code.claude.com/docs/en/headless).

## Agent discipline

1. For **Cursor `/prompt-loop`**: after expand, **run path A (MCP loop)** first; use terminal script only if MCP missing or user wants CLI.
2. One prompt body per iteration—don’t batch multiple manifest items into one tool response unless the user asked.
3. If stuck on one item, say so and stop rather than skipping silently.
