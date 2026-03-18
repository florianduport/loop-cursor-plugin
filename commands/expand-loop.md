---
name: expand-loop
description: Generate per-item Agent prompts from a template (list, directory walk, or git files). Run the loop-expand script then process prompts one chat at a time.
---

# Expand prompt loop

## 1. Choose source

- **Explicit list:** `--values` or `--values-file` (lines or JSON array)
- **Folder:** `--dir <path>` plus optional `--glob` (repeatable), e.g. `**/*.tsx`
- **Git:** `--git-path <prefix>` for tracked files under the repo

## 2. Run expander

From the user’s **project root**:

```bash
node <plugin>/scripts/loop-expand.mjs \
  --template 'YOUR TEMPLATE with {{relpath}} or {{item}}' \
  <source flags> \
  --force
```

Use `--template-file path` for long templates. Add `--confirm` if item count can exceed 500.

## 3. Run Agent once per file

1. Open `.loop/prompts/001-….md` (or the first file numerically).
2. Copy its full contents into a **new** Agent chat **or** attach via `@`.
3. Complete that scope only.
4. Repeat with `002-…`, `003-…`, etc.

If MCP **loop-prompt** is enabled: call `loop_next_prompt` with `projectRoot` set to the workspace root; after each chat call `loop_mark_done` with that item’s index.

## 4. Check progress

Read `.loop/manifest.json` (or MCP `loop_status`).
