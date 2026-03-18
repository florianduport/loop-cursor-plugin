---
name: prompt-loop
description: In Cursor or Claude Code—expand list/dir/git + template into .loop/prompts, then run every item automatically. Cursor default = MCP loop in this chat; optional = Claude CLI script.
---

# Prompt loop (expand + run)

When the user invokes this command with a **list file** (`@file`) **or** dir/git source, plus a **template** (with `{{item}}`, `{{index}}`, etc.):

1. **Expand** into `.loop/prompts/*.md` (do not stop there unless they asked **expand only** / **dry run** / **don’t run**).
2. **Run all items automatically** using the right path below.

---

## Step 1 — Expand

`projectRoot` = absolute path to the workspace folder (where `.loop/` lives).

- Prefer MCP **`loop_expand`** with `force: true` when re-running, **or**  
- `node "<PLUGIN_ROOT>/scripts/loop-expand.mjs" --project-root "<projectRoot>" ...`

**PLUGIN_ROOT** = folder containing `scripts/loop-expand.mjs`.

---

## Step 2 — Run all items (pick one path)

### A) **Cursor Agent — default** (loop-prompt MCP enabled)

Use this when the **loop-prompt** MCP tools are available (typical Cursor IDE with this plugin’s MCP on).

**In this same chat**, until finished:

1. Call **`loop_next_prompt`** with `{ "projectRoot": "<absolute projectRoot>" }`.
2. If the tool says **LOOP COMPLETE** / no more items → go to **Step 3**.
3. Otherwise: read the **`>>> EXECUTE ONLY THIS PROMPT`** section and **do exactly that** (one item only—reply, edit files, whatever the prompt asks).
4. Call **`loop_mark_done`** with `projectRoot` and the **`index`** shown in the banner (e.g. manifest index `4`).
5. Repeat from step 1.

Do **not** ask the user to say “run the loop”. Do **not** require opening each `.md` in a new chat for this flow.

### B) **Claude Code terminal** (optional)

Use when the user asks for **terminal / claude cli**, or when **loop-prompt MCP is unavailable** and `claude` is on PATH:

```bash
bash "<PLUGIN_ROOT>/scripts/loop-run-claude.sh" "<projectRoot>/.loop/prompts" --allowedTools Read,Write,Bash,Edit
```

Adjust `--allowedTools` to the task. If `claude` is missing, do **not** pretend the run succeeded—explain and fall back to **A** if MCP exists, else expand-only + instructions.

### C) **Neither MCP nor CLI**

After expand: tell the user to enable **loop-prompt** MCP in Cursor **or** install Claude Code for the script **or** open each file under `.loop/prompts/` manually.

---

## Step 3 — Summarize

Short summary: N items, what was done per item (or table), any failures.

## Opt-out

**Expand only** / **no run** / **just generate** → Step 1 only; mention MCP loop or `loop-run-claude.sh` for later.
